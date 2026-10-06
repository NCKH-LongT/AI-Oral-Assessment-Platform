# OralAI — Thi vấn đáp

## Desktop chọn ngôn ngữ và model — 07/10/2026

Mở bài thi trên desktop, tại **Nhận dạng giọng nói trên desktop** chọn **Tiếng Việt / Tiếng Anh** và **PhoWhisper-small / Whisper-small (đa ngôn ngữ)**. Lựa chọn được nhớ trên thiết bị cho máy chủ hiện tại, áp dụng cả khi ghi mới và **Thử STT lại**. Không đổi giữa lúc ghi/nhận dạng/nộp bài. Hotword vẫn lấy từ đúng môn/phiên thi; lựa chọn trên desktop không thay cấu hình STT của trình duyệt web.

Cần build lại runtime và bổ sung model Whisper-small bằng `python scripts/build_desktop_stt.py`, rồi mở lại Electron hoặc đóng gói lại bộ cài. Launcher/bộ cài kiểm tra đủ hai model và khả năng của helper; runtime cũ không được âm thầm bỏ qua lựa chọn. Máy học viên dùng bộ cài đầy đủ không phải tự tải model. Xem [hướng dẫn desktop](readme-desktop.md#chọn-ngôn-ngữ-và-model-nhận-dạng).

## Hotword riêng theo môn — 06/10/2026

Vào **Môn học & đề thi → chọn môn → Bài thi & giao bài → Hotword STT của môn học** để lưu từ vựng riêng cho môn đó. Hỗ trợ tối đa **500 thuật ngữ**, **100 ký tự/mục**, **10.000 ký tự tổng cộng**; danh sách 200 mục không còn bị giới hạn 100 mục. Dòng trống và mục trùng được loại trước khi tính giới hạn. Web hiển thị số mục/ký tự và báo lỗi trước khi lưu.

Đã bỏ hotword chung trong Cấu hình giọng nói; dữ liệu chung cũ không còn áp dụng hoặc tự sao chép sang các môn. STT chỉ nhận hotword của môn thuộc phiên thi, không cắt về 100 mục. Đề mới giữ bản sao hotword tại lúc sinh đề; sửa danh sách môn không đổi đề đã sinh. Xem [hướng dẫn hotword và cập nhật](docs/architecture/examination-workflow.md#hotword-stt).

Áp dụng: `docker compose up -d --build --wait`, sau đó đóng/mở lại desktop từ source; bộ cài desktop cần đóng gói lại. Bản sửa này không thêm migration hoặc biến `.env`.

## Quy trình khảo thí và hotword STT — 05/10/2026

Đã bổ sung role **EXAM_OFFICER** do admin duyệt, giao giảng viên theo môn, nhập sinh viên Excel, sinh/review/duyệt câu hỏi và rubric, xếp lịch theo sinh viên, chấm lại bài AI dưới 5 và xuất điểm Excel. Module sinh snapshot và Excel được tách khỏi router quản trị.

- [Hướng dẫn đầy đủ và thiết kế luồng thi](docs/architecture/examination-workflow.md).
- [Tải Excel mẫu danh sách sinh viên](docs/templates/danh-sach-sinh-vien.xlsx).
- Hotword riêng theo môn áp dụng cho PhoWhisper desktop, Whisper server, Google STT và Gemini STT (cập nhật 06/10/2026).
- Cần migration **0005**, dependency Excel mới và build lại desktop để nhận hotword. Xem hướng dẫn triển khai trong tài liệu trên.


Desktop ghi audio/video, lọc nhiễu RNNoise và nhận dạng **PhoWhisper-small hoặc Whisper-small cục bộ**. Server nhận media gốc + transcript, chấm theo rubric/RAG bằng **Ollama local hoặc Gemini**, rồi trả kết quả cho app.

## Hướng dẫn theo nhu cầu

| Bạn muốn làm gì? | Tài liệu |
| --- | --- |
| Tạo môn, sinh câu hỏi/thuật ngữ, giao bài, làm bài và xóa môn | [Hướng dẫn sử dụng cho admin, giảng viên và học viên](docs/user-guide.md) |
| Cài desktop, chọn server, kiểm tra mic và làm bài | [Hướng dẫn OralAI Desktop](readme-desktop.md) |
| Chọn đúng lệnh mở desktop từ source hoặc server | [Bắt đầu nhanh](readme-desktop.md#bắt-đầu-nhanh) |
| Cập nhật server và xử lý lỗi pipeline | [Hướng dẫn Jenkins](docs/jenkins.md) |
| Thu thử/nghe lại, chỉnh gain, thêm dấu câu hoặc thoát app | [Mic, dấu câu và thoát desktop](docs/microphone-desktop.md) |
| Nghe lại và sửa transcript trước khi nộp | [Kiểm tra transcript](docs/transcript-correction.md) |
| Build, đóng gói và kiểm tra bộ cài Windows/Linux/macOS | [Build desktop](docs/desktop-build.md) |
| Chuẩn bị tài nguyên STT bắt buộc trong bộ cài | [STT resources](apps/desktop/resources/stt/README.md) |
| Hiểu luồng nhận dạng, tài liệu kiến thức và LLM chấm bài | [Kiến trúc STT/LLM](docs/architecture/knowledge-speech.md) |
| Quản lý tài khoản, môn học và đăng nhập Google | [Tài khoản, OAuth và desktop](docs/architecture/accounts-courses-desktop.md) |
| Quản lý dữ liệu, kiểm tra mic và lọc nhiễu | [CRUD và kiểm tra tiếng ồn](docs/architecture/crud-noise-check.md) |
| Cấu hình số lần thi, cấp thêm lượt và xem lịch sử | [Làm lại bài thi](docs/architecture/exam-retakes.md) |
| Hiểu độ tin cậy AI và thao tác chấm lại | [Độ tin cậy và chấm lại](docs/architecture/grading-confidence.md) |
| Nạp bộ câu hỏi mẫu môn Kiểm thử phần mềm | [Bộ dữ liệu Software Testing](data/software-testing-istqb/README.md) |
| Xem kiến trúc ban đầu và kế hoạch phát triển | [Giai đoạn 1](docs/architecture/phase-1.md), [Project Guide](AI_Oral_Assessment_PROJECT_GUIDE.md) |
| Xem những gì đã kiểm thử và giới hạn còn lại | [Biên bản kiểm thử](docs/validation.md) |

Để bắt đầu: chạy server theo mục bên dưới, sau đó làm theo hướng dẫn desktop. Project Guide và biên bản kiểm thử có các phần lịch sử; đọc ghi chú cập nhật trước khi áp dụng.

## Chạy server

Cần Docker Compose và Python 3. Tại thư mục gốc:

```bash
python3 scripts/setup_env.py
# Sửa cấu hình LLM trong .env trước khi dùng chấm thật.
docker compose up -d --build --wait
```

Mở **http://localhost:3000**, đăng nhập bằng `BOOTSTRAP_ADMIN` / `BOOTSTRAP_PASSWORD` trong `.env`. Mặc định `AI_PROVIDER=demo` chỉ thử quy trình, không chấm điểm.

## Chọn LLM qua .env

**Gemini:**

```dotenv
AI_CONFIG_SOURCE=env
AI_PROVIDER=gemini
GEMINI_API_KEY=your-key
LLM_MODEL=gemini-2.5-flash
EMBEDDING_MODEL=gemini-embedding-001
```

**Ollama chạy local trên server:** tải sẵn một model chat hỗ trợ JSON schema và model embedding **768 chiều**, ví dụ `qwen3:8b` và `nomic-embed-text`:

```bash
ollama pull qwen3:8b
ollama pull nomic-embed-text
```

```dotenv
AI_CONFIG_SOURCE=env
AI_PROVIDER=local
LOCAL_LLM_URL=http://host.docker.internal:11434
LOCAL_LLM_TIMEOUT=180
LLM_MODEL=qwen3:8b
EMBEDDING_MODEL=nomic-embed-text
```

Ollama phải lắng nghe tại địa chỉ API/worker truy cập được. Docker dùng `host.docker.internal` để tới host; chạy API native thì dùng `http://127.0.0.1:11434`. Đặt Ollama trong mạng nội bộ. Không dùng `localhost` trong container để trỏ tới host.

Sau khi đổi `.env`:

```bash
docker compose up -d --no-deps --force-recreate api worker
```

`AI_CONFIG_SOURCE=env` ưu tiên cấu hình AI trong `.env`, bỏ qua AI cũ lưu trên web. `admin` chỉ dành cho triển khai cũ muốn tiếp tục chỉnh AI trên web. OAuth và cấu hình ngôn ngữ STT vẫn chỉnh trên web. Đề đã công bố giữ snapshot AI/rubric; đổi provider/model thì xử lý lại tài liệu và công bố đề mới.

## Desktop và kiểm tra mic

Đang sửa source trên Linux/macOS: chạy **`./run-desktop.sh`**. Script chỉ mở UI dev cổng 3001 và Electron, dùng server bạn đã chạy tại localhost:3000; không gọi Docker. Sửa giao diện tự cập nhật. Cần bundle STT đã build; xem [hướng dẫn](readme-desktop.md).

Cài bộ OralAI từ workflow **Desktop installers**. Bộ cài chứa **PhoWhisper-small, Whisper-small đa ngôn ngữ, runtime STT và FFmpeg**; cả hai chạy CPU INT8. Máy học viên không cần Python hoặc tải thêm model để nhận dạng. App vẫn cần kết nối server để đăng nhập, lấy đề, nộp bài và nhận điểm.

1. Chọn server tại **OralAI → Cấu hình máy chủ…**.
2. Mở bài, cấp quyền và chọn microphone/camera trong danh sách **Chọn thiết bị**.
3. Để **Gain microphone** ở 0 dB rồi bấm **Kiểm tra độ ồn**: giữ im lặng 3 giây đầu, nói thử 7 giây sau.
4. Phát lại bản thử, bật/tắt **Nghe bản đã lọc nhiễu RNNoise** để so sánh. Bản thử không upload.
5. Chọn bật/tắt **Lọc nhiễu RNNoise khi nhận dạng câu trả lời**, bắt đầu thi, kiểm tra transcript rồi nộp.

Giọng nhỏ có thể tăng gain từng ít một; âm rè/gần −1 dBFS thì giảm gain và thu lại. Gain áp dụng cho bản thu thử, audio/video và STT của lần ghi mới. Bấm **Thoát ứng dụng** hoặc X để đóng; nếu còn bản chưa nộp, chọn **Ở lại** hoặc xác nhận **Rời trang / thoát**. Xem [hướng dẫn mic và thoát app](docs/microphone-desktop.md).

Sau khi ghi, chọn **Bản gốc** hoặc **Bản giảm nhiễu RNNoise** rồi bấm **Thử STT lại** nếu cần nhận dạng lại.

Người dùng nghe lại và sửa transcript bằng tay trước khi nộp. Chức năng sửa chính tả bằng LLM đã được gỡ. Xem [kiểm tra transcript](docs/transcript-correction.md).

Desktop luôn chạy STT local; lựa chọn STT trên server chỉ điều khiển đường nhận dạng của trình duyệt web. Media gốc được lưu riêng, không thay bằng bản đã lọc. Worker xử lý bất đồng bộ; app tự cập nhật điểm hoặc trạng thái cần xem lại.

## Thuật ngữ tiếng Anh và xóa môn học

Khi bấm **Sinh câu hỏi & rubric để review**, AI gợi ý thuật ngữ tiếng Anh kèm nghĩa tiếng Việt cho từng câu hỏi. Admin xem ngay trong **Môn học & đề thi → Bài thi & giao bài → Câu hỏi & thuật ngữ tiếng Anh gợi ý**. Gợi ý được lưu cùng phiên bản đề; đề cũ không tự sinh lại, chế độ demo không tạo thuật ngữ. Thuật ngữ do AI sinh để giảng viên kiểm tra; STT dùng bảng hotword riêng do admin/giảng viên cấu hình, không tự đưa đáp án vào nhận dạng.

Thao tác từng bước từ chuẩn bị giáo trình đến giao đề: [hướng dẫn admin/giảng viên](docs/user-guide.md#admin-và-giảng-viên-chuẩn-bị-bài-thi). Hiện chưa sửa trực tiếp thuật ngữ; sao chép đề thành bản nháp rồi công bố để sinh bộ câu hỏi/gợi ý mới.

Admin vào **Môn học → Cài đặt → Xóa môn học**, nhập đúng mã môn để xóa vĩnh viễn toàn bộ tài liệu, chủ đề, rubric, đề thi, lượt thi, kết quả và bản ghi, kể cả bài đang làm. Tài khoản người dùng và môn khác được giữ lại. Worker dọn tệp sau khi giao dịch xóa thành công, tự thử lại nếu storage lỗi. Nếu môn đang được worker xử lý, chờ rồi thử xóa lại. Giảng viên chỉ xóa được môn trống do mình quản lý.

## Số lần làm bài và kết quả

**Độ tin cậy AI:** lỗi chấm, demo và bài không tính điểm hiện “Chưa có độ tin cậy AI”, không hiển thị 0% giả. Số phần trăm khi chấm thành công do LLM tự báo, chưa được hiệu chuẩn. Nếu gặp `AI_CONFIG_MISMATCH`, cần tài liệu và phiên bản đề khớp cấu hình AI hiện tại. Admin có thể chọn **Chấm lại transcript đã nộp** với phiên bản giữ nguyên câu hỏi/rubric; lưu lịch sử và luôn yêu cầu xem lại. Xem [độ tin cậy và chấm lại](docs/architecture/grading-confidence.md).

Admin mở **Môn học & đề thi → chọn môn → Bài thi & giao bài → Cấu hình số lần làm lại**: không cho làm lại, cho làm lại N lần hoặc không giới hạn. Ví dụ cho làm lại 1 lần là tổng cộng 2 lượt.

**Kết quả & xem lại** hiển thị từng lần thi. Mở **Quản lý lượt thi** để cấp thêm lượt riêng cho sinh viên hoặc xóa lần thi được chọn. Sinh viên xem lịch sử và bấm **Làm lại bài thi** khi còn lượt. [Chi tiết và nâng cấp database](docs/architecture/exam-retakes.md).

## Admin chọn STT trên server

Trong **Cấu hình hệ thống → STT & giọng nói**, admin có thể chọn Gemini hoặc Google Cloud STT cho trình duyệt web. Desktop vẫn nhận dạng local.

Khi xem kết quả, mở **Nhận dạng lại & chấm lại**, chọn nhà cung cấp và nhập lý do:

- **Gemini STT:** dùng API key và model trong `.env`:

```dotenv
GEMINI_API_KEY=your-key
GEMINI_STT_MODEL=gemini-2.5-flash
```

- **Google Cloud STT:** mở mục cấu hình JSON trong tab STT, upload service-account JSON hợp lệ (tối đa 64 KB). Cần bật Speech-to-Text API, billing và cấp quyền cho tài khoản. Upload không tự đổi nhà cung cấp.

Nhận dạng lại dùng audio gốc và hoạt động cả khi `AI_PROVIDER=local`. Nhà cung cấp đã chọn nhận dạng, còn LLM chấm vẫn theo snapshot đề. **Chỉ Google Cloud STT cần JSON; Gemini không cần.** Giữ transcript đã nộp và lịch sử trước/sau. Gemini không trả độ tin cậy âm học nên kết quả này cần giảng viên kiểm tra trước khi công nhận điểm.

## Build, cập nhật và tài liệu

Build desktop cần chuẩn bị bundle STT trước; xem [hướng dẫn desktop](readme-desktop.md) và [đóng gói](docs/desktop-build.md). Không đưa binary/model hoặc `.env` vào Git.

`Jenkinsfile` build/kiểm tra/deploy web và API; bộ cài desktop dùng workflow riêng. Nếu deploy bằng Jenkins, đồng bộ các biến mới trong credential `oral-ai-env`.

Xem [các bước cập nhật và chẩn đoán lỗi Jenkins](docs/jenkins.md). Lỗi 4 test Gemini/Ollama thiếu `english_terms` đã được sửa ở `b546e84`; job cần checkout commit này hoặc mới hơn, không cần đổi `.env` cho lỗi đó.

Cập nhật server: `docker compose up -d --build --wait`, sau đó mở lại desktop. Compose tự chạy migration đến `0005` để lưu nhiều lần thi và quy trình khảo thí; không cần thêm biến `.env`. Không xóa volume dữ liệu. Kiểm tra chờ chấm/lỗi bằng `docker compose logs --tail=100 worker`.

```bash
.venv/bin/python -m pytest services/api/tests -q
npm run lint
npm run typecheck
npm run build
npm run test:audio
npm run test:desktop
```

Tra cứu thêm trong [Hướng dẫn theo nhu cầu](#hướng-dẫn-theo-nhu-cầu) ở đầu trang.
