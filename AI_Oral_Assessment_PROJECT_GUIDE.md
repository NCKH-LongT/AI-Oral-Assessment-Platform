# AI Oral Assessment Platform — Project Guide

[README](README.md) · [Kiến trúc](docs/architecture/phase-1.md) · [Hướng dẫn sử dụng](docs/user-guide.md) · [Desktop](readme-desktop.md)

Tài liệu dành cho người phát triển OralAI, mô tả cấu trúc và quy tắc của source hiện hành. Cấu hình chạy, triển khai và thao tác người dùng nằm ở các hướng dẫn liên kết bên dưới.

Migration `0011` thêm snapshot quy định desktop cho mỗi lượt. `user_profiles.py` cung cấp hồ sơ/lớp/đợt thi theo người dùng; `desktop_policy.py` quản lý 10 công tắc ADMIN và audit. `desktop-policy.cjs` lấy quy định có xác thực trong Electron main process. Giao diện profile mở lại ReviewPage hiện có. [Thiết kế hồ sơ và quy định desktop](docs/architecture/user-profiles-desktop-policy.md).

## Mục tiêu và phạm vi

OralAI tổ chức thi vấn đáp: chuẩn bị môn và kiến thức, soạn câu hỏi/rubric, duyệt đề, xếp lịch, ghi câu trả lời, nhận dạng, chấm nội dung và giảng viên đối chiếu minh chứng. Web phục vụ admin, khảo thí và giảng viên; sinh viên dùng desktop.

Desktop đóng gói **Whisper-small** cho bài thử thiết bị và tương thích client cũ. Bài thi mới hiển thị câu hỏi/hướng dẫn, tải bản ghi gốc rồi giao hàng đợi server nhận dạng và chấm theo cấu hình STT cùng ngôn ngữ/hotword của đề. LLM chấm dựa trên transcript, câu hỏi, rubric và nguồn RAG. Audio, camera và màn hình phục vụ đối chiếu.

## Tổ chức đào tạo và lớp học

Migration `0010` bổ sung bộ môn, lớp, thành viên lớp và đợt thi từ bản sao đề trong ngân hàng. `services/api/app/academic.py` xử lý CRUD, nhập Excel và lịch; `security.exam_access` kiểm tra phạm vi lớp cho kết quả/minh chứng/chấm lại. `apps/admin-web/components/academic.tsx` cung cấp giao diện quản lý và lớp được phân công. Menu soạn đề tách khỏi quản lý môn; ngân hàng lọc category/rubric, trang người dùng có tìm kiếm/lọc vai trò.

Giáo viên lớp không tự trở thành chủ sở hữu môn. Các đợt thi đóng băng snapshot đề và roster, có ID/lượt thi/điểm độc lập. Xem [thiết kế bộ môn và lớp học](docs/architecture/academic-classes.md) trước khi sửa quyền hoặc truy vấn kết quả; kiểm thử hồi quy tại `test_academic.py`, `test_migration.py` và `tests/e2e/academic.spec.ts`.

## Cấu trúc repository

| Đường dẫn | Trách nhiệm |
| --- | --- |
| `apps/admin-web` | Next.js/React: quản trị, điều phối, review, giao diện dùng chung cho desktop và proxy client local |
| `apps/desktop` | Electron: quyền media, STT cục bộ, đăng nhập qua trình duyệt hệ thống, chế độ thi và chuẩn bị màn hình |
| `services/api/app` | FastAPI, phân quyền, nghiệp vụ, AI/RAG, upload/storage và worker |
| `services/api/alembic/versions` | Migration database; phiên bản hiện tại `0007` |
| `services/api/tests` | Kiểm thử API/nghiệp vụ với dữ liệu cô lập |
| `tests` | Kiểm thử Node/Python và Playwright |
| `scripts` | Launcher, chuẩn bị môi trường và build STT |
| `data` | Bộ môn mẫu cùng importer và dữ liệu kiểm tra |
| `docs` | Hướng dẫn sử dụng, kiến trúc, triển khai và nghiên cứu |

PostgreSQL/pgvector lưu dữ liệu và embedding; MinIO hoặc local storage lưu tài liệu/minh chứng; Redis hỗ trợ giới hạn request. Worker là process riêng dùng chung backend, lấy công việc bền vững trong database. [Tổng quan triển khai](docs/architecture/phase-1.md).

## Nguyên tắc kiến trúc

- **Server quyết định quyền và điểm.** Kiểm tra chủ sở hữu phiên, phạm vi môn, lịch thi, số lượt, rubric và giới hạn dữ liệu trên API. Header nhận diện desktop không phải chứng thực bộ cài.
- **Chấm nội dung theo transcript.** Model STT chạy trên máy học viên; LLM chấm và embedding chạy ở server hoặc provider cấu hình. Credential không gửi xuống desktop.
- **Snapshot đề bất biến.** Lưu câu hỏi, rubric, hotword, nguồn kiến thức và cấu hình AI theo phiên bản. Đổi dữ liệu/cấu hình phải tạo phiên bản phù hợp; không sửa snapshot đã dùng để chấm.
- **Minh chứng riêng.** Audio/camera ghi theo câu trả lời. Ghi toàn màn hình áp dụng theo chính sách phiên thi, từ lúc bắt đầu đến nộp bài, với đồng ý và trạng thái hiển thị rõ.
- **Đối chiếu có lịch sử.** Nhận dạng lại, chấm lại và điểm giảng viên duyệt có lý do, người thao tác và audit. Lỗi AI không trở thành điểm 0 giả.
- **Giao dịch và tác vụ nền.** Giữ khóa và idempotency cho nộp/chấm/xóa. Worker dọn file sau commit, tự thử lại khi storage lỗi.

## Luồng nghiệp vụ

1. Admin cấp tài khoản và vai trò. Khảo thí phân công giảng viên, quản lý sinh viên/môn và danh sách kỳ thi.
2. Giảng viên chuẩn bị LO, chủ đề, giáo trình/tài liệu và rubric. Mỗi môn có hotword riêng.
3. Câu hỏi có thể nhập sẵn qua Excel hoặc sinh bằng AI theo blueprint và nguồn RAG. Giảng viên review/duyệt, khảo thí xếp lịch và mở thi.
4. Sinh viên mở desktop, chọn bài, microphone/camera và ngôn ngữ; chuẩn bị một màn hình và cấp quyền ghi toàn màn hình khi yêu cầu.
5. Mỗi câu: bắt đầu ghi → kết thúc ghi → STT local → nộp transcript và audio/video. Có thử nhận dạng lại hoặc ghi lại khi cần.
6. Worker truy xuất kiến thức trong snapshot và chấm theo rubric. App chờ upload hoàn tất để nộp bài thi.
7. Giảng viên xem transcript, bản ghi, điểm, citation và sự kiện giám sát; chấm lại bài cần review. Khảo thí xuất điểm theo quy trình duyệt.

[Quy trình khảo thí](docs/architecture/examination-workflow.md) · [STT/RAG](docs/architecture/knowledge-speech.md) · [Độ tin cậy và review](docs/architecture/grading-confidence.md).

## Điểm và số lần thi

Điểm câu hỏi được chuẩn hóa theo điểm tối đa và trọng số tiêu chí về thang 10. Điểm tổng là trung bình cộng điểm tất cả câu, làm tròn 2 chữ số. Câu chưa chấm hoặc lỗi giữ bài ở trạng thái cần xử lý; điểm 0 hợp lệ vẫn được tính. Điểm AI và điểm chính thức được phân biệt; điểm giảng viên duyệt toàn bài có thể khác trung bình AI.

Số lượt theo chính sách đề và lượt cấp thêm; từng lần có số thứ tự, trạng thái, điểm và lịch sử. [Quản lý lượt thi](docs/architecture/exam-retakes.md).

## Upload, dung lượng và nhập Excel

Upload chia chunk, kiểm tra hash từng chunk và file, có retry. Hàng đợi client nằm trong bộ nhớ; giữ app mở đến khi hoàn tất nộp bài. Mỗi bản ghi thuộc đúng người/phiên/câu; API kiểm tra quyền khi xem.

Admin có báo cáo dung lượng theo môn, sinh viên và lần thi. Dọn media mặc định giữ transcript, điểm và lịch sử; tùy chọn xóa toàn bộ lần thi cần xem trước và xác nhận. Bài đang làm/chấm lại bị chặn dọn. Worker thực hiện xóa file và ghi trạng thái.

Import Excel có mẫu, kiểm tra trước, lỗi theo dòng và giao dịch nguyên khối. Hỗ trợ môn, rubric, câu hỏi có sẵn, giảng viên, khảo thí và danh sách sinh viên. Đề nhập được lưu nháp, còn bước duyệt trước khi thi. [Quản lý dữ liệu và Excel](docs/user-guide.md#quản-lý-lần-thi-và-dung-lượng).

## Desktop và bảo vệ phiên thi

Electron dùng `contextIsolation`, sandbox và IPC kiểm tra renderer/origin. App ghi màn hình theo chính sách, dùng kiosk và hạn chế thao tác điều hướng khi thi. Mất focus, thay màn hình hoặc ngắt ghi được lưu thành sự kiện cần review. Đây là kiểm soát ở cấp ứng dụng; triển khai có yêu cầu cao cần máy được quản lý và giám thị.

Ubuntu/GNOME hỗ trợ app tạm tắt màn hình phụ rồi khôi phục bố cục. Các hệ khác dùng cấu hình màn hình của hệ điều hành. [Chi tiết và giới hạn](readme-desktop.md#truy-cập-và-ghi-màn-hình-bắt-buộc).

## Quy tắc phát triển

1. Đọc README, tài liệu kiến trúc liên quan, schema và test trước khi sửa; tuân thủ `AGENTS.md` tại thư mục làm việc.
2. Giới hạn thay đổi theo yêu cầu; nêu hướng xử lý ngắn trước thay đổi nhiều file. Giữ module nhỏ, kiểu dữ liệu rõ và validation tường minh.
3. Giữ các nguyên tắc server quyết định điểm, chấm transcript theo RAG, snapshot phiên bản và minh chứng có quyền truy cập. Thay kiến trúc lõi cần ghi quyết định thiết kế.
4. Không đưa `.env`, credentials, dữ liệu cá nhân, model hoặc binary sinh ra vào Git. Không ghi OAuth query/token vào log.
5. Kiểm thử hồi quy theo hành vi thay đổi, dùng dữ liệu cô lập. Không chạy ca tạo/xóa bài thi trên server thật để kiểm thử.
6. Tài liệu mô tả chức năng hiện tại. Phân biệt kiểm thử kỹ thuật với đánh giá chất lượng AI trên dữ liệu thực.

## Chạy và kiểm tra

```bash
npm ci
npm run dev
# Hoặc mở Electron cùng giao diện source:
npm run desktop
```

Chuẩn bị STT theo [build desktop](docs/desktop-build.md). Backend theo [README](README.md#chạy-server); CI/deploy theo [Jenkins](docs/jenkins.md).

```bash
npm run lint
npm run typecheck
npm run build
npm run test:desktop
npm run test:audio
npm run test:screen
python3 -m unittest discover -s tests -p test_desktop_stt.py
.venv/bin/python -m pytest services/api/tests -q
```

Playwright cần giao diện đang chạy; các ca dùng API thật cần backend kiểm thử riêng. [Phạm vi kiểm thử](docs/validation.md). Kế hoạch nghiên cứu, baseline và thí nghiệm nằm tại [hướng dẫn bài báo](docs/research/conference-paper-guide.md); chưa coi test kỹ thuật là bằng chứng độ chính xác chấm thi.
