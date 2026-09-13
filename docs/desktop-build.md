# Build desktop cho Windows, Ubuntu và macOS

Desktop là Electron client tải giao diện từ domain OralAI. API/AI và Google credentials nằm trên server. Mỗi máy cài app chọn domain riêng, không cần sửa source hay build lại khi đổi backend.

## Cấu hình máy chủ

Lần mở bộ cài đầu tiên, nhập domain trong **Cấu hình máy chủ**, bấm **Kiểm tra kết nối** rồi **Lưu & kết nối**. Có thể mở lại bằng menu **OralAI → Cấu hình máy chủ…**. Ví dụ `https://oral.example.edu`; chỉ dùng `http://localhost:3000` khi server ở chính máy đó. Không thêm `/api`; domain phải phục vụ cả web và reverse proxy `/api/*`.

Ứng dụng kiểm tra `/api/health`, chỉ nhận HTTPS hoặc HTTP loopback, không nhận đường dẫn/query/credentials. Lưu vào `server.json` trong thư mục userData của Electron. Khi đổi domain, ứng dụng hỏi trước khi tải lại và xóa session/cache của origin cũ; nộp bài đang làm trước khi đổi. Địa chỉ từ biến `ORAL_WEB_URL` có ưu tiên cao hơn file đã lưu ở lần khởi động, phù hợp máy được quản lý tập trung; bỏ biến này nếu muốn dùng cấu hình trên giao diện.

Cửa sổ cấu hình dùng trang local và preload riêng; trang web không được gọi IPC đọc/ghi cấu hình máy chủ. Chỉ origin đang chọn được cấp camera/mic và IPC STT. Google login mở trình duyệt mặc định của hệ điều hành; domain gốc cấu hình trên admin phải khớp địa chỉ desktop và redirect URI Google.

## Build trên máy

Cài Node.js 22 và Git. Từ thư mục gốc repository:

```bash
npm ci
npm run check -w apps/desktop
npm run test:desktop
```

Chạy lệnh tương ứng **trên hệ điều hành đích**:

| Hệ điều hành | Lệnh | Kết quả trong `apps/desktop/dist/` |
| --- | --- | --- |
| Windows | `npm run dist:win -w apps/desktop` | NSIS `.exe` |
| Ubuntu/Linux | `npm run dist:linux -w apps/desktop` | `.AppImage` và `.deb` |
| macOS | `npm run dist:mac -w apps/desktop` | `.dmg` và `.zip` |

`npm run pack -w apps/desktop` tạo thư mục unpacked để kiểm tra nhanh. Kiến trúc mặc định theo máy build; có thể truyền `-- --x64` hoặc `-- --arm64` nếu target hỗ trợ. Với STT native bundle, phải build Python helper đúng OS/architecture của bộ cài, không dùng helper x64 cho app ARM. macOS nên build trên macOS; workflow bên dưới dùng runner đúng OS. Xem [electron-builder configuration](https://www.electron.build/configuration/).

Ubuntu: cài `.deb` bằng `sudo apt install ./apps/desktop/dist/OralAI-0.1.0-linux-amd64.deb`; hoặc cấp quyền chạy AppImage rồi mở. Nếu máy thiếu hỗ trợ FUSE cho AppImage, dùng `.deb` hoặc chạy `APPIMAGE_EXTRACT_AND_RUN=1 ./apps/desktop/dist/OralAI-0.1.0-linux-x86_64.AppImage`. Windows chạy `.exe` để chọn thư mục cài. macOS mở `.dmg` và kéo app vào Applications.

Các bộ cài mặc định chưa có code signing/notarization. Phân phối chính thức cần chứng chỉ ký Windows và Apple Developer signing/notarization theo [hướng dẫn electron-builder](https://www.electron.build/code-signing.html); không đặt chứng chỉ/mật khẩu vào source. Chưa có auto-update hoặc tự publish release.

## GitHub Actions

Vào **Actions → Desktop installers → Run workflow**. Workflow `.github/workflows/desktop.yml` build trên Windows, Ubuntu, macOS; mỗi job upload artifact `OralAI-OS-ARCH`, lưu 14 ngày. Tải artifact của đúng hệ điều hành, giải nén và dùng bộ cài. Đây là build thủ công, không tự chạy ba hệ điều hành ở mọi push. CI chính vẫn chạy lint, test API/UI, test cấu hình desktop và Docker Compose. Repository hiện dùng GitHub Actions, chưa có Jenkinsfile. Compose đã chia sẻ volume `app_data` giữa API/worker nên không cần thêm dịch vụ hoặc volume để lưu cấu hình trên web.

Bộ cài đã kiểm tra build ngày 13/09/2026: [tải artifacts Windows x64, Linux x64 và macOS ARM64](https://github.com/NCKH-LongT/AI-Oral-Assessment-Platform/actions/runs/34741414321). Artifacts cần tài khoản GitHub có quyền truy cập repository và hết hạn sau 14 ngày; chạy workflow lại để tạo bản mới. Bản macOS ARM64 dành cho Apple Silicon; build `-- --x64` trên macOS để tạo bản Intel. Build thành công không thay thế kiểm tra thiết bị thật hoặc ký bộ cài.

## STT local có cần Python không?

- Nếu admin chọn **Whisper server** hoặc **Google STT**, máy học viên không cần Python/FFmpeg; bộ cài tiêu chuẩn đã đủ. Đây là mặc định cho các bộ cài không có bundle STT.
- Nếu admin chọn **Whisper local**, có hai cách:
  1. Máy học viên cài Python 3.12 và `faster-whisper`, `imageio-ffmpeg`. Có thể đặt `ORAL_PYTHON` là đường dẫn Python. Bộ cài mang theo `transcribe.py` và module lọc nhiễu chung; không cần clone repository trên máy học viên.
  2. Build kèm helper native để máy học viên không cần cài Python. Trong workflow, bật **bundle_stt**; hoặc làm trên OS/architecture đích trước khi build Electron:

```bash
python -m pip install -r services/api/requirements.lock "pyinstaller>=6,<7"
python scripts/build_desktop_stt.py
npm run dist -w apps/desktop
```

Helper được đặt ở `apps/desktop/resources/stt/oral-stt/` và đóng vào resources của app. Bộ cài có bundle lớn hơn; không đưa helper đã build vào Git. Whisper vẫn cần tải model lần đầu hoặc chuẩn bị sẵn cache model; bundle không có sẵn mọi model. `STT_MODEL` chọn model local (mặc định `base`), `ORAL_PYTHON` nếu được đặt sẽ ưu tiên Python chỉ định thay cho helper. Model Whisper cấu hình trên web áp dụng cho **server**, không ép model local trên máy cấu hình yếu.

Google OAuth/AI/STT cần mạng tới server/dịch vụ tương ứng. Bộ cài này không biến hệ thống thành ứng dụng thi offline; giữ cửa sổ mở đến khi nộp bài và minh chứng thành công.
