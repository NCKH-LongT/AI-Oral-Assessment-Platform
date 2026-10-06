# Quy trình khảo thí, duyệt đề, lịch thi và điểm chính thức

Cập nhật 05/10/2026. Hướng dẫn này mô tả luồng hiện hành cho kỳ thi được tạo trong **Điều phối kỳ thi**. Một kỳ thi ứng với một đề thuộc một môn; mỗi môn có một giảng viên phụ trách theo `Course.owner_id`. Phân công lại môn chuyển quyền quản lý toàn bộ đề và bài chấm của môn đó.

## Phân quyền

| Role | Quyền |
| --- | --- |
| ADMIN | Cấp/thu hồi role, duyệt yêu cầu khảo thí; quản trị hệ thống và hỗ trợ mọi bước |
| EXAM_OFFICER | Tạo kỳ thi, phân công giảng viên đã có role TEACHER, nhập Excel, xem đề đã duyệt, trả đề, xếp lịch, mở thi, xuất điểm |
| TEACHER | Chỉ quản lý môn được phân công; cấu hình đề, sinh/sửa câu hỏi và rubric, duyệt gửi khảo thí; chấm lại bài thuộc môn |
| STUDENT | Đăng nhập email/mật khẩu hoặc Google trên desktop, xem bài được giao, thi đúng lịch, xem điểm chính thức |
| REVIEWER | Vai trò xem lại cũ; không được thay khảo thí mở kỳ thi hoặc ghi điểm chính thức |

Tài khoản STUDENT có thể mở **Yêu cầu quyền khảo thí → Gửi yêu cầu làm khảo thí**. Admin mở **Người dùng**, kiểm tra yêu cầu và lưu role EXAM_OFFICER. Yêu cầu chưa duyệt không cấp quyền. Admin cũng có thể tạo trực tiếp tài khoản khảo thí hoặc phân role cho tài khoản có sẵn; mọi role được kiểm tra trên server ở mỗi request.

## Tổ chức một kỳ thi

1. Admin tạo môn học và phân role TEACHER cho giảng viên.
2. Khảo thí mở **Điều phối kỳ thi**, nhập tên kỳ thi, môn, giảng viên và thời lượng. Hệ thống tạo đề DRAFT cùng rubric tạm; giảng viên cần cấu hình trước khi sinh đề.
3. Khảo thí tải [Excel mẫu](../templates/danh-sach-sinh-vien.xlsx), sửa dữ liệu rồi nhập vào kỳ thi. Có thể nhập trước khi giảng viên soạn đề.
4. Giảng viên vào **Môn học & đề thi → môn được giao** để bổ sung giáo trình, chủ đề và LO. Trong **03 · Bài thi & giao bài → Sửa bản nháp**, chọn rubric, số câu và độ khó EASY/MEDIUM/HARD. Mỗi hàng blueprint có chủ đề, độ khó, số lượng; chọn số lượng 1 để cấu hình từng câu. Tối đa 20 câu.
5. Cấu hình **Hotword STT của môn học** nếu cần, rồi bấm **Sinh câu hỏi & rubric để review**. AI tạo bản GENERATED, chưa mở cho sinh viên. Demo tạo nội dung mẫu, không chấm điểm AI thật.
6. Giảng viên sửa câu hỏi, ý chính mong đợi, tên/mô tả/điểm tối đa/trọng số rubric; bấm **Lưu nội dung đã review**, sau đó **Duyệt đề & gửi khảo thí**. Trạng thái TEACHER_APPROVED. Các nguồn tham chiếu phải nằm trong tài liệu của chủ đề; server kiểm tra điều này.
7. Khảo thí xem toàn bộ đề/rubric trong **Điều phối kỳ thi**. Nếu cần sửa, nhập lý do **Trả về bản nháp**; hệ thống hủy bản sinh và dấu duyệt, giảng viên cấu hình/sinh/review lại.
8. Khảo thí chọn một, nhiều hoặc tất cả sinh viên, nhập giờ mở/đóng vào thi rồi **Lưu lịch thi**. Chỉ xếp lịch sau khi giảng viên duyệt. Mỗi sinh viên có thể có khung giờ riêng; thời gian nhập theo múi giờ máy, lưu dưới dạng Unix timestamp.
9. Khi tất cả sinh viên có lịch hợp lệ, khảo thí bấm **Xác nhận đã kiểm tra đề & mở kỳ thi**. Trạng thái PUBLISHED, khóa đề, danh sách và lịch. Bản snapshot lưu câu hỏi, rubric, nguồn kiến thức, cấu hình AI, hotword môn học và dấu duyệt.
10. Sinh viên mở desktop, đăng nhập bằng email trong Excel, vào **Bài thi của tôi**, chọn bài khi đến giờ. Server kiểm tra danh sách và lịch ở cả bước tạo phiên và bắt đầu thi. Đăng ký môn học không tự cấp quyền thi kỳ thi theo luồng mới.
11. Sau khi nộp, worker server chấm AI. Bài có điểm AI trung bình **< 5/10**, thiếu điểm hoặc cần kiểm tra độ tin cậy chuyển REVIEW_REQUIRED; sinh viên chưa thấy điểm chính thức.
12. Giảng viên mở **Kết quả & xem lại**. Bài dưới 5 có nền cảnh báo và điểm AI đề xuất. Xem transcript/audio/video, nhập điểm 0–10 cùng nhận xét ít nhất 10 ký tự, bấm **Lưu điểm chính thức**. Hệ thống lưu riêng điểm AI, người chấm lại, thời gian và lý do; giữ audit trước/sau.
13. Khảo thí chọn **Xuất điểm Excel** trong kỳ thi. Mỗi lần thi không bị xóa là một dòng; sinh viên chưa thi vẫn có dòng NOT_STARTED. `final_score` chỉ có khi COMPLETED; điểm đang chờ duyệt không bị xuất nhầm thành điểm chính thức.

Giờ đóng là **hạn bắt đầu vào thi**, không phải thời điểm cưỡng bức kết thúc mọi phiên. Sau khi bắt đầu hợp lệ, sinh viên có đủ `time_limit`. Khung giờ vào thi tối thiểu bằng thời lượng đề. Đề đã PUBLISHED không sửa trực tiếp; tạo kỳ thi mới khi cần thay đề/lịch/danh sách.

## Excel

File `.xlsx`, sheet đầu tiên, đúng 4 cột theo thứ tự:

| Cột | Ý nghĩa |
| --- | --- |
| student_number | MSSV bắt buộc; dùng ô Text để giữ số 0 đầu; tối đa 80 ký tự |
| email | Email bắt buộc, được chuẩn hóa chữ thường; phải khớp tài khoản đăng nhập |
| full_name | Họ tên bắt buộc, tối đa 150 ký tự |
| initial_password | Tùy chọn, 12–128 ký tự nếu nhập; chỉ dùng khi tạo tài khoản mới |

Thay/xóa dòng ví dụ trong mẫu trước khi nhập. Nếu để trống mật khẩu ở tài khoản mới, sinh viên cần đăng nhập Google bằng đúng email (admin phải bật Google login). Google chỉ tự gắn danh tính có `email_verified=true` với duy nhất tài khoản STUDENT đang hoạt động do import tạo (`sv-…`); không tự liên kết tài khoản quản trị/giảng viên hoặc tài khoản thủ công. Tài khoản có sẵn giữ tên, mật khẩu và role, không bị Excel ghi đè.

Giới hạn 2 MB, 5000 sinh viên, 20 MB sau giải nén. Không nhận công thức, email/MSSV trùng, MSSV xung đột với danh sách cũ hoặc email thuộc tài khoản khác role. Toàn bộ import nằm trong một transaction: một dòng lỗi hủy cả lượt nhập. Nhập lại cùng danh sách không tạo thêm assignment. Mật khẩu được hash; không lưu trong audit hoặc trả về ở export.

Export gồm `student_number`, `email`, `full_name`, `attempt`, `status`, `ai_score`, `final_score`, `review_reason`. Chuỗi được ghi dưới kiểu text để tên sinh viên bắt đầu bằng `=` không trở thành công thức Excel.

## Hotword STT

**Cập nhật 06/10/2026:** Hotword chỉ lưu riêng theo môn, không còn cấu hình từ vựng chung. Admin hoặc giảng viên quản lý môn vào **Môn học & đề thi → chọn môn → Bài thi & giao bài → Hotword STT của môn học**. API GET/PUT `/admin/courses/{id}/hotwords` kiểm tra quyền với đúng môn đó. Mỗi môn có danh sách độc lập; xóa danh sách một môn không ảnh hưởng môn khác.

Tối đa **500 từ/cụm từ**, **100 ký tự mỗi mục**, **10.000 ký tự tổng cộng** (không tính dấu xuống dòng). Bỏ khoảng trắng đầu/cuối, dòng trống và mục trùng trước khi tính giới hạn. Web hiển thị bộ đếm và thông báo lỗi tiếng Việt trước khi gửi; API kiểm tra lại và từ chối toàn bộ nếu vượt giới hạn, không lưu một phần. Electron dùng cùng giới hạn, kể cả ký tự Unicode; server không âm thầm cắt danh sách còn 100 mục/2000 ký tự.

Từ vựng môn được cố định trong snapshot khi sinh đề hoặc publish đề legacy mới; muốn thay cần trả về nháp và sinh/duyệt lại. Với đề cũ chưa có trường hotword trong snapshot, dùng danh sách hiện tại của chính môn đó. Snapshot có danh sách rỗng vẫn giữ rỗng. `/stt/config` không có phiên thi không trả từ vựng môn nào.

Hotword chung đã lưu ở phiên bản cũ được bỏ qua khi đọc cấu hình, không gộp vào phiên thi và không tự sao chép sang các môn. Nếu cần giữ thuật ngữ cũ, quản trị viên chọn các từ phù hợp rồi lưu vào từng môn. API cấu hình giọng nói chỉ lưu nhà cung cấp, ngôn ngữ và tiền xử lý; không nhận trường `hotwords` nữa.

Desktop lấy `/stt/config?session_id=…`; server kiểm tra chủ sở hữu phiên rồi trả hotword, không trả đáp án hoặc expected concepts. Renderer truyền cấu hình qua IPC, main process kiểm tra giới hạn, rồi helper nhận `STT_HOTWORDS` JSON. PhoWhisper và Whisper server dùng tham số `hotwords`; Google Speech v1 dùng `speechContexts` với boost 10; Gemini nhận gợi ý từ vựng với chỉ dẫn không thêm từ không nghe thấy. Luồng chấm bài vẫn độc lập STT.

Bản sửa 06/10 không thêm migration hoặc biến `.env`. Cập nhật API/worker/web bằng `docker compose up -d --build --wait`. Đóng/mở lại Electron đang chạy từ source để nạp giới hạn mới, hoặc đóng gói/cài lại desktop; không cần tải lại model hay build lại helper STT chỉ vì thay đổi này. Bộ cài cũ vẫn giới hạn 100 mục nên phải nâng cấp trước khi dùng danh sách lớn hơn.

Hotword hỗ trợ nhận dạng, không tự sửa đáp án hoặc bảo đảm chính xác. Ưu tiên bảng từ vựng ngắn, sát môn; không nhập đáp án. Thuật ngữ tiếng Anh do AI sinh cho từng câu vẫn để giảng viên review, **không tự lấy expected concepts hoặc đáp án làm gợi ý STT**. Sinh viên vẫn cần nghe và kiểm tra transcript trước khi nộp.

Tham khảo triển khai: [faster-whisper hotwords](https://github.com/SYSTRAN/faster-whisper/blob/master/faster_whisper/transcribe.py), [Google SpeechContext](https://github.com/googleapis/googleapis/blob/master/google/cloud/speech/v1/cloud_speech.proto).

## Module và triển khai

- `exam_generation.py`: dựng snapshot từ blueprint và RAG, không tự publish/commit.
- `examination.py`, `examination_schemas.py`: phân công, duyệt, lịch, roster, chấm tay và xuất điểm.
- `excel.py`: đọc XLSX có giới hạn, kiểm tra dữ liệu, tạo template/export.
- `worker.finalize`: tính điểm AI, áp dụng ngưỡng dưới 5, giữ riêng điểm chấm lại.
- `examination.tsx`, `exam-draft-review.tsx`, `course-hotwords.tsx`: UI điều phối và review tách khỏi component quản trị lớn.

Migration `0005` thêm các cột vào bảng cũ, không xóa dữ liệu. Exam cũ giữ `workflow=false`; quyền xem qua đăng ký môn, endpoint publish/assign cũ vẫn phục vụ dữ liệu và tích hợp cũ. Publish trực tiếp chỉ còn dành cho ADMIN với đề legacy. Mọi đề tạo qua Điều phối hoặc chuyển qua **Sinh câu hỏi & rubric để review** có `workflow=true` và phải qua quy trình duyệt. Đề mới do TEACHER tạo cũng dùng workflow. Không thể dùng endpoint publish/assign cũ để bỏ qua quy trình của đề workflow.

Cập nhật server bằng `docker compose up -d --build --wait`; service migrate chạy `alembic upgrade head`. Nếu chạy thủ công: cài lại dependency từ `services/api/requirements.lock`, chạy `alembic upgrade head` trong `services/api`, rồi khởi động lại API/worker/web. Build lại desktop để helper mới nhận hotword. Không cần sửa `.env` cho hotword hoặc role mới.

Không tự chạy migration lên database đang vận hành trong phiên chỉnh sửa mã. Chạy backup/triển khai theo quy trình của môi trường trước khi đưa phiên bản này vào sử dụng.
