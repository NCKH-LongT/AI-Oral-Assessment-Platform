# Kiểm thử OralAI

[README](../README.md#hướng-dẫn-theo-nhu-cầu) · [Build desktop](desktop-build.md)

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
