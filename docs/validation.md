# Kiểm thử OralAI

[README](../README.md#hướng-dẫn-theo-nhu-cầu) · [Build desktop](desktop-build.md)

## Desktop gọn và bộ cài Windows nhẹ — 21/10/2026

Kiểm tra trên Windows 10 x64. Các phiên kiểm thử dùng profile cô lập, không
đăng nhập hoặc sửa dữ liệu bài thi production.

- **18/18 ca Node desktop đạt**, gồm ba ca trình tải model: revision cố định,
  SHA-256, dùng lại model khi offline, tệp sai checksum, lỗi mạng và thử lại.
- **Kiểm thử Electron bố cục đạt** tại 1024×640, 1280×680 và 1366×700: đăng
  nhập, kiểm tra thiết bị, câu hỏi, camera và nút thao tác. API được giả lập;
  đây không phải xác minh camera/microphone vật lý.
- **Kiểm thử đóng Electron/IPC đạt**: giữ/rời trang theo xác nhận và thoát thật.
- **Bản Windows nhẹ thật trên profile trống đạt**: màn hình thiết lập, tải
  khoảng 464 MiB từ Hugging Face, kiểm tra model, helper đóng gói nạp model,
  vào đăng nhập server online với CSS desktop và khởi động lại dùng model đã
  lưu. Lượt kiểm tra cuối hoàn tất trong khoảng 43 giây trên kết nối máy build;
  đây không phải cam kết tốc độ tải cho máy sinh viên.
- Build NSIS bản đầy đủ khoảng 639 MB (609 MiB), bản nhẹ khoảng 203 MB
  (194 MiB). Xác minh bản nhẹ không chứa thư mục trọng số model và metadata
  bật tải lần đầu; file bàn giao đã được đối chiếu SHA-256 với output build.
- Cú pháp Electron/trình tải, cú pháp script Python build và `git diff --check`
  đạt. Không có thay đổi web/API/worker hoặc migration trong bản desktop này.

Chưa kiểm tra bộ cài mới trên máy Windows sạch thứ hai, macOS/Linux hoặc ghi
và nộp một bài thi thật với thiết bị vật lý. Không coi việc helper nạp được
model là phép đo chất lượng nhận dạng. Lệnh tái kiểm tra nằm trong
[hướng dẫn build](desktop-build.md#kiểm-tra-trước-phát-hành).

## Bản sửa thiếu model và khôi phục chế độ thi — 12/10/2026

Kiểm thử trên checkout cô lập; không thao tác bài thi hay dữ liệu production.

- API: **123 đạt, 5 bỏ qua**. Năm ca bỏ qua cần PostgreSQL/row locking; lần này dùng SQLite. Bao phủ payload thiếu model, ownership/kênh desktop, hạn giờ/trạng thái, idempotency, tiến câu, minh chứng bắt buộc và nhận dạng lại có quyền.
- Thiếu model: không chạy STT/LLM, transcript rỗng, confidence/điểm `null`, trạng thái cần review; audio/video gốc và màn hình theo chính sách vẫn bắt buộc. Lỗi runtime/STT thông thường không được chuyển thành bỏ qua.
- Node: **15 desktop, 8 screen, 3 audio, 2 proxy backend đạt**. Bao phủ model có/không có, runtime hỏng, kiosk lặp/rollback, hủy chooser, stream đến muộn, lỗi encoder và giữ các đoạn minh chứng.
- Kiểm tra hook React cô lập bổ sung: **9/9 đạt** với ScreenRecording thật và bridge/media giả lập, gồm lỗi begin/capture/report, hủy + kết quả đến muộn, chooser blur, sự kiện sau khóa lại và timeout/retry. Đây không thay thế kiểm thử Electron trên hệ điều hành thật.
- Python: 4 ca launcher/STT, 3 ca GNOME và 10 ca Docker cleanup đạt. Ruff các file Python thay đổi, cú pháp Electron, ESLint, TypeScript và production build đạt.
- Đã bổ sung Playwright regression cho thiếu model, cài model rồi thử lại, begin/capture/report thất bại, hủy/retry, chooser blur và sự kiện mới sau khi khóa lại. Danh sách test/biên dịch fixture kiểm tra được; **chưa chạy qua trình duyệt thành công trong môi trường này**: Chromium dừng ngay khi khởi chạy với `socket() failed: Operation not permitted`, trước khi mở ứng dụng. Không coi lỗi hạ tầng này là pass UI.
- Chưa xác minh Electron/Windows/macOS/GNOME/PipeWire thật hoặc model Whisper thật cho bản sửa này; các kết quả native ngày 11/10 bên dưới là của bản trước. Cần chạy lại các ca trên máy đích trước khi phát hành bộ cài.
- Không thay workflow/Jenkins, không kích hoạt CI thủ công, merge hoặc deploy. Cập nhật cần web/API và Electron đồng bộ, không có migration mới.

## Phạm vi xác minh ngày 11/10/2026

Desktop nhận dạng bằng Whisper-small, sinh viên chọn tiếng Việt/Anh, câu hỏi và hướng dẫn hiển thị, transcript gửi tự động để server chấm. Kiểm thử dùng dữ liệu cô lập; các ca UI bên dưới giả lập API và bridge STT, ghi media bằng thiết bị giả lập Chromium.

| Nhóm | Kết quả |
| --- | --- |
| API trên SQLite cô lập | 105 ca đạt, 5 ca cần PostgreSQL bỏ qua |
| TypeScript, ESLint, Next production build | Đạt |
| Ruff cho backend, scripts và helper | Đạt |
| Cú pháp Electron | Đạt |
| Node desktop: quyền, hotword, model, đóng cửa sổ, khóa thi và màn hình | 11 ca đạt |
| Node audio, ghi màn hình, proxy backend | 3 + 4 + 2 ca đạt |
| Python helper STT | Đạt: mặc định Whisper-small, vi/en, hotword, JSON tiếng Việt qua cp1252/ASCII/UTF-8 và đầu vào không hợp lệ |
| Python quản lý màn hình GNOME | 3 ca đạt |
| Playwright desktop và audio web | 12 ca đạt sau khi cập nhật kỳ vọng UI và fixture lưu ngôn ngữ |
| Build helper và nạp model offline | Đạt: protocol 2, Whisper-small, vi/en, hotword |
| Electron thực → IPC → helper native | Đạt với vi/en; mặc định Whisper-small khi request không truyền model |
| Đóng gói Linux unpacked | Đạt; tài nguyên gồm helper, Whisper-small và license |

## Hành vi được kiểm tra

- Model cố định dù profile lưu lựa chọn khác; ngôn ngữ được nhớ sau reload và bị khóa khi đang ghi/xử lý/nộp.
- Giao diện sinh viên hiển thị câu hỏi và trạng thái STT. Payload nộp gồm đúng transcript cùng confidence.
- Lỗi lần nhận dạng đầu chặn nộp, cho thử lại; lỗi nhận dạng lại giữ kết quả thành công trước. Hotword từ phiên thi giữ nguyên.
- Hash audio nhận dạng và audio upload khớp bản ghi gốc. Thiết bị bị rút, từ chối quyền và kết nối lại có trạng thái phù hợp; stream/recorder được giải phóng.
- Bài luyện tập web giữ luồng audio và ô transcript của web.
- Kiểm tra native dùng file giọng nói công khai `tests/data/jfk.flac` của faster-whisper, profile Electron và trang HTTP local riêng. Test xác nhận đường chạy/metadata/transcript có nội dung, không đo độ chính xác ASR.

## Chạy lại

```bash
npm run lint
npm run typecheck
npm run build
npm run check -w apps/desktop
npm run test:desktop
npm run test:audio
npm run test:screen
npm run test:backend
npm run test:desktop-displays
python3 -m unittest discover -s tests -p test_desktop_stt.py
```

Mở giao diện source bằng `npm run dev`, rồi chạy các ca dùng API giả lập:

```bash
E2E_BASE_URL=http://localhost:3001 npx playwright test tests/e2e/desktop-stt.spec.ts tests/e2e/desktop-speech-settings.spec.ts tests/e2e/desktop-devices.spec.ts tests/e2e/desktop-displays.spec.ts tests/e2e/original-audio.spec.ts
```

Chuẩn bị bundle theo [hướng dẫn build](desktop-build.md), rồi kiểm tra native và đóng gói:

```bash
ORAL_STT_TEST_AUDIO=/path/to/sample.wav npm run test:desktop-stt
npm run pack -w apps/desktop
```

Các ca Playwright dùng API thật như `platform.spec.ts` cần backend kiểm thử riêng. Không trỏ toàn bộ suite vào server đang chứa bài thi thật. Bộ API dùng fixture cô lập; các ca khóa đồng thời cần PostgreSQL:

```bash
TEST_DATABASE_URL=sqlite:// PYTHONPATH=services/api .venv/bin/python -m pytest services/api/tests -q
```

## Giới hạn xác minh

Lượt kiểm tra này chạy Linux; chưa build hoặc thử bản cài Windows/macOS. Unit test JSON kiểm tra mã hóa pipe Windows, không thay cho kiểm tra bộ cài trên Windows thật. Chưa benchmark WER/CER, hiệu chuẩn confidence hay chất lượng chấm trên dữ liệu sinh viên. Không gọi LLM trả phí và không chạy kỳ thi thật trong các ca UI/native này. Ghi màn hình và chống gian lận còn giới hạn ở cấp ứng dụng như [hướng dẫn desktop](../readme-desktop.md#truy-cập-và-ghi-màn-hình-bắt-buộc).
