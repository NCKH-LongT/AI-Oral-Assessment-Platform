# Hướng dẫn chạy OralAI Desktop

OralAI Desktop là ứng dụng Electron tải giao diện web từ một máy chủ OralAI. Máy học viên không cần chạy PostgreSQL, MinIO hay backend khi ứng dụng kết nối tới server đã deploy.

## 1. Chạy từ source

Yêu cầu:

- Node.js 22.12 trở lên và npm.
- Máy có môi trường đồ họa.
- Backend/web OralAI đang hoạt động trên localhost hoặc một domain HTTPS.

Mở terminal tại thư mục gốc repository, nơi có `package.json`:

```bash
npm ci
```

### Kết nối server đã deploy

Thay `https://oral.example.edu` bằng domain thật. Không thêm `/api` và không thêm đường dẫn phía sau domain.

Ubuntu/Linux hoặc macOS:

```bash
ORAL_WEB_URL=https://oral.example.edu \
  env -u ELECTRON_RUN_AS_NODE npm run desktop
```

Windows PowerShell:

```powershell
Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
$env:ORAL_WEB_URL = "https://oral.example.edu"
npm run desktop
```

Ứng dụng sẽ dùng trực tiếp web, API, database và media trên server. Thay đổi trong `apps/desktop/main.cjs` hoặc preload cần đóng rồi mở lại app. Có thể mở **View → Toggle Developer Tools** để xem Console và Network.

### Kết nối hệ thống chạy trên cùng máy

Khởi động hệ thống trước:

```bash
docker compose up -d --wait
```

Sau đó chạy desktop:

```bash
env -u ELECTRON_RUN_AS_NODE npm run desktop
```

Địa chỉ mặc định là `http://localhost:3000`.

### Dùng giao diện web local khi phát triển

Nếu muốn sửa giao diện Next.js local và xem trong Electron, chạy web local ở terminal thứ nhất. Ví dụ backend local chạy tại `http://127.0.0.1:8001`:

```bash
API_INTERNAL_URL=http://127.0.0.1:8001 \
  npm run dev -w apps/admin-web -- --port 3100
```

Mở desktop ở terminal thứ hai:

```bash
ORAL_WEB_URL=http://localhost:3100 \
  env -u ELECTRON_RUN_AS_NODE npm run desktop
```

Nếu chỉ sửa web local nhưng muốn dùng API đã deploy, đặt `API_INTERNAL_URL=https://oral.example.edu/api` ở lệnh chạy Next.js. Trường hợp này có `/api` vì địa chỉ đi qua reverse proxy public của server.

Google login trên desktop hoạt động ổn định khi app tải trực tiếp domain đã cấu hình trong `PUBLIC_ORIGIN`. Khi dùng web local tại `localhost:3100`, callback Google vẫn quay về domain server; nên dùng tài khoản/mật khẩu để debug giao diện local, hoặc tạo một OAuth client riêng cho môi trường development.

## 2. Chọn hoặc đổi máy chủ trong ứng dụng

Lần đầu chạy bản đóng gói, ứng dụng mở cửa sổ **Cấu hình máy chủ**:

1. Nhập domain gốc, ví dụ `https://oral.example.edu`.
2. Bấm **Kiểm tra kết nối**.
3. Bấm **Lưu & kết nối**, sau đó xác nhận.

Có thể mở lại bằng menu **OralAI → Cấu hình máy chủ…**. Ứng dụng kiểm tra endpoint `/api/health` và lưu domain trên máy cho lần chạy sau.

Chỉ chấp nhận HTTPS. HTTP chỉ được dùng với `localhost`, `127.0.0.1` hoặc `::1`. Domain không được chứa `/api`, đường dẫn, query, username hoặc password.

Biến `ORAL_WEB_URL` luôn ưu tiên hơn domain đã lưu. Bỏ biến này nếu muốn chọn server bằng giao diện. Nộp xong bài trước khi đổi domain vì ứng dụng sẽ tải lại và xóa phiên/cache của domain cũ.

## 3. Chạy bằng bộ cài

Tải artifact từ **GitHub → Actions → Desktop installers → một run thành công → Artifacts**, chọn đúng hệ điều hành rồi giải nén.

### Ubuntu/Linux

Cài file `.deb`:

```bash
sudo apt install ./apps/desktop/dist/OralAI-0.1.0-linux-amd64.deb
oralai
```

Hoặc chạy AppImage:

```bash
chmod +x ./apps/desktop/dist/OralAI-0.1.0-linux-x86_64.AppImage
./apps/desktop/dist/OralAI-0.1.0-linux-x86_64.AppImage
```

Nếu máy thiếu FUSE:

```bash
APPIMAGE_EXTRACT_AND_RUN=1 \
  ./apps/desktop/dist/OralAI-0.1.0-linux-x86_64.AppImage
```

### Windows

Chạy file `.exe`, chọn thư mục cài đặt rồi mở **OralAI** từ Start Menu. Windows có thể hiện cảnh báo SmartScreen vì bộ cài hiện chưa ký số.

### macOS

Mở file `.dmg`, kéo **OralAI** vào Applications rồi mở ứng dụng. Artifact macOS hiện tại là ARM64 cho Apple Silicon; máy Intel cần build bản x64. Bộ cài hiện chưa được ký và notarize.

## 4. Build bộ cài

Kiểm tra source trước khi build:

```bash
npm ci
npm run check -w apps/desktop
npm run test:desktop
```

Build trên hệ điều hành đích:

| Hệ điều hành | Lệnh                                 | Kết quả trong `apps/desktop/dist/` |
| ------------ | ------------------------------------ | ---------------------------------- |
| Windows      | `npm run dist:win -w apps/desktop`   | NSIS `.exe`                        |
| Ubuntu/Linux | `npm run dist:linux -w apps/desktop` | `.deb` và `.AppImage`              |
| macOS        | `npm run dist:mac -w apps/desktop`   | `.dmg` và `.zip`                   |

Build thư mục unpacked để kiểm tra nhanh:

```bash
npm run pack -w apps/desktop
```

Có thể chạy workflow `.github/workflows/desktop.yml` trong GitHub Actions để build đồng thời trên Windows, Ubuntu và macOS. Các artifact mặc định không kèm code signing và không tự phát hành release.

## 5. STT và Python trên máy học viên

### Gemini chấm text, Whisper nhận dạng

Trong **Cấu hình hệ thống**, lưu riêng hai lựa chọn:

1. **AI & mô hình → Google Gemini**: nhập Gemini API key để sinh câu hỏi và chấm transcript.
2. **STT & giọng nói → Whisper local trên máy sinh viên (desktop)**: nhận dạng trên máy học viên. Chọn **Whisper trên server nội bộ** nếu muốn chạy model trên API.

**Không cần JSON Google STT cho cả hai cách dùng Whisper**, kể cả khi bật `AI_PROVIDER=gemini`. Desktop lấy STT policy từ server trước mỗi lần nhận dạng, rồi gửi transcript lên để worker chấm. Việc nộp bài không tự nhận dạng lại bằng Google.

Nếu app đòi JSON, kiểm tra nhà cung cấp đang lưu trong **STT & giọng nói**: đổi từ Google sang Whisper và bấm **Lưu cấu hình STT**. `STT_PROVIDER=local` trong `.env` chỉ là mặc định khi chưa có STT policy lưu trên web; cấu hình đã lưu được ưu tiên. Đổi AI provider không thay đổi STT policy.

### Chuẩn bị Whisper

Nếu admin chọn **Whisper server** hoặc **Google STT**, máy học viên không cần Python hay FFmpeg.

Nếu admin chọn **Whisper local trên máy sinh viên**, dùng một trong hai cách:

- Cài Python 3.12 cùng `faster-whisper` và `imageio-ffmpeg`, sau đó đặt `ORAL_PYTHON` tới executable Python.
- Build bộ cài kèm helper native theo hướng dẫn trong [docs/desktop-build.md](docs/desktop-build.md).

Ví dụ Linux/macOS khi chạy từ source:

```bash
python3.12 -m venv .venv
.venv/bin/pip install "faster-whisper>=1.1,<2" "imageio-ffmpeg>=0.6,<0.7"
ORAL_PYTHON="$PWD/.venv/bin/python" \
  env -u ELECTRON_RUN_AS_NODE npm run desktop
```

Model Whisper được tải ở lần sử dụng đầu tiên. Kiểm tra tiếng ồn trước khi thi chạy bằng Web Audio API trong Electron và không cần Python; học viên có thể dùng nút bỏ qua kiểm tra này.

Windows PowerShell:

```powershell
py -3.12 -m venv .venv
.\.venv\Scripts\pip install "faster-whisper>=1.1,<2" "imageio-ffmpeg>=0.6,<0.7"
$env:ORAL_PYTHON = "$PWD\.venv\Scripts\python.exe"
Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
npm run desktop
```

Model desktop mặc định là `base`; có thể đặt biến `STT_MODEL` trên máy học viên trước khi mở app. Lựa chọn **Model Whisper trên server** trong trang quản trị chỉ áp dụng cho Whisper chạy trong API.

## 6. Xử lý lỗi thường gặp

| Lỗi                                  | Cách xử lý                                                                                    |
| ------------------------------------ | --------------------------------------------------------------------------------------------- |
| Không mở cửa sổ Electron             | Chạy `env -u ELECTRON_RUN_AS_NODE npm run desktop`; kiểm tra đang có môi trường đồ họa.       |
| Không kết nối được server            | Mở `https://DOMAIN/api/health` trên trình duyệt; ô domain không được có `/api`.               |
| Domain HTTP trên máy khác bị từ chối | Cấu hình HTTPS cho server; HTTP chỉ hỗ trợ loopback.                                          |
| Không thấy nút Google                | Admin cần bật Google OAuth và nhập Client ID/Secret; `PUBLIC_ORIGIN` phải đúng domain server. |
| Camera/mic không hoạt động           | Cấp quyền hệ điều hành cho OralAI và kiểm tra domain dùng HTTPS hoặc localhost.               |
| Web yêu cầu mở desktop để STT        | Admin đang chọn Whisper local; dùng Electron hoặc đổi STT sang Whisper server/Google.         |
| AppImage báo lỗi FUSE                | Cài bằng `.deb` hoặc dùng `APPIMAGE_EXTRACT_AND_RUN=1`.                                       |

Chi tiết đóng gói, helper STT và giới hạn phân phối: [docs/desktop-build.md](docs/desktop-build.md).
