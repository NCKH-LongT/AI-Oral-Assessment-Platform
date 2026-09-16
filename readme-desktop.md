# OralAI Desktop

Bộ cài desktop bao gồm runtime Python đóng gói, FFmpeg và **PhoWhisper-small INT8**. Nhận dạng chạy trên CPU của máy học viên, không cần cài Python riêng hoặc tải model sau khi cài. LLM chấm bài chạy trên server.

## Một lệnh mở app từ code mới — Linux/macOS

Trong thư mục repository, chạy:

```bash
./run-desktop.sh
```

Script chỉ mở giao diện **dev tại http://localhost:3001** và Electron, kết nối server có sẵn tại `http://localhost:3000`. Không chạy lệnh Docker, build server, cài dependency hay sửa cấu hình server. Sửa giao diện sẽ tự cập nhật; sửa Electron thì đóng app và chạy lại script. Backend do bạn chạy/cập nhật riêng. Script dùng profile dev riêng nên cần đăng nhập lại lần đầu; bỏ qua `ORAL_WEB_URL` cũ và gỡ `ELECTRON_RUN_AS_NODE` khỏi tiến trình con.

Cần server đang chạy, Node 22.12+, Python 3, dependency đã cài bằng `npm ci` và bundle PhoWhisper đã build theo hướng dẫn bên dưới. Sửa helper STT/model thì build lại bundle trước khi chạy script. Script không đọc/sửa `.env` hoặc tự tải code từ Git.

Server khác: `./run-desktop.sh --server http://localhost:3100`. Tham số này là URL web gốc, không thêm `/api`. Nếu server chưa chạy, script báo rõ rồi dừng.

Để đăng nhập/nộp bài từ UI dev, thêm `http://localhost:3001` vào `ALLOWED_ORIGINS` của API (giữ các origin đang có). Nếu đổi `--port`, thêm origin tương ứng. Bạn tự áp dụng cấu hình này khi chạy server; script không thay cấu hình hoặc khởi động lại Docker.

Cổng bận: `./run-desktop.sh --port 3002`. Script từ chối dùng một dev server đang chạy để tránh mở nhầm bản cũ. Đóng Electron hoặc Ctrl+C sẽ dừng dev server của phiên đó; server đang dùng không bị thay đổi. Lệnh `npm run desktop` đơn thuần chỉ mở Electron, không build hoặc cập nhật giao diện ở địa chỉ server.

Sau **Cho phép camera & mic**, phần **Nghe lại bản ghi kiểm tra** luôn hiển thị. Bấm **Kiểm tra độ ồn**, chờ thu xong 10 giây; app cuộn tới phần phát lại. Chọn checkbox **Nghe bản đã lọc nhiễu RNNoise** rồi bấm **Phát bản đã lọc nhiễu**, hoặc bỏ chọn để **Phát bản gốc**. Nếu bộ lọc lỗi, có thông báo và bản gốc vẫn nghe được khi đã thu thành công.

## Cài và kết nối

Tải artifact từ GitHub Actions → **Desktop installers**. Windows dùng `.exe`, Ubuntu dùng `.deb` hoặc AppImage, macOS dùng `.dmg`. Bộ cài chưa ký số/notarize. Chọn đúng OS/kiến trúc máy.

Mở **OralAI → Cấu hình máy chủ…**, nhập domain HTTPS hoặc `http://localhost:3000` nếu server trên cùng máy. Không thêm `/api`. `ORAL_WEB_URL` nếu có sẽ ưu tiên domain đã lưu.

## Kiểm tra mic trước khi thi

1. Cấp quyền camera và microphone. Trong mục **Chọn thiết bị**, chọn **Microphone** và **Camera** từ danh sách; app kết nối ngay. Tên đầy đủ xuất hiện sau khi cấp quyền.
2. Bấm **Kiểm tra độ ồn**. Ghi khoảng 10 giây: 3 giây đầu giữ im lặng, 7 giây sau nói thử.
3. Bấm phát audio. Checkbox **Nghe bản đã lọc nhiễu RNNoise** đổi giữa bản gốc và bản lọc của cùng đoạn thu.
4. Checkbox **Lọc nhiễu RNNoise khi nhận dạng câu trả lời** quyết định bản audio dùng cho STT trong bài thi. Đặt trước khi bắt đầu thi.

Danh sách cập nhật khi cắm/rút thiết bị. Không đổi thiết bị khi đang ghi hoặc xử lý/nộp câu trả lời. Đổi mic/camera trước thi sẽ hủy kết quả kiểm tra cũ; kiểm tra lại hoặc chọn bỏ qua. Thiết bị bị rút sẽ báo lỗi để bạn chọn lại, không âm thầm dùng thiết bị khác.

Bản kiểm tra chỉ giữ tạm trong bộ nhớ; kiểm tra lại hoặc rời trang sẽ giải phóng. Không gửi bản kiểm tra lên server. Nếu RNNoise không tải được, app báo lỗi và cho phép tắt lọc để dùng bản gốc. Không phát mic trực tiếp ra loa để tránh hú/vọng.

## Khi làm bài

- App giữ riêng audio/video gốc và audio dùng STT. RNNoise xử lý theo thời gian thực ở 48 kHz; trước PhoWhisper chỉ chuyển về WAV mono 16 kHz, không lọc FFmpeg lần nữa.
- Khi dừng ghi, PhoWhisper nhận dạng local. Bạn xem lại transcript, sau đó gửi transcript và media gốc lên server.
- Worker chấm text bằng Gemini hoặc Ollama theo cấu hình đề; app cập nhật kết quả định kỳ. Đừng đóng app trước khi upload và nộp bài hoàn tất.
- Lựa chọn `STT_PROVIDER` của server không đổi desktop sang Google/server STT. Nó chỉ áp dụng cho trình duyệt web. Ngôn ngữ vẫn lấy từ cấu hình server.
- PhoWhisper-small được tinh chỉnh cho tiếng Việt. Có thể chọn tiếng Anh trong policy nhưng chưa benchmark chất lượng; đề tiếng Việt là mục tiêu chính.

## Chạy từ source

Cần Node.js 22.12+, Python 3.12 và giao diện đồ họa. Tại thư mục gốc:

```bash
npm ci
python3.12 -m venv .venv-stt
.venv-stt/bin/pip install -r scripts/requirements-desktop-stt.txt
.venv-stt/bin/python scripts/build_desktop_stt.py
env -u ELECTRON_RUN_AS_NODE npm run desktop
```

Windows PowerShell:

```powershell
npm ci
py -3.12 -m venv .venv-stt
.\.venv-stt\Scripts\pip install -r scripts/requirements-desktop-stt.txt
.\.venv-stt\Scripts\python scripts/build_desktop_stt.py
Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
npm run desktop
```

Bước build cần mạng để tải model VinAI và thư viện; bước chạy helper không cần mạng. Source desktop tự dùng helper đã build. `ORAL_PYTHON` chỉ dùng để debug bằng Python ngoài; `ORAL_STT_MODEL` có thể trỏ tới thư mục model CTranslate2 đã chuẩn bị. `STT_MODEL` trên server không thay model kèm desktop.

Để dùng giao diện đang phát triển: chạy `API_INTERNAL_URL=http://127.0.0.1:8000 npm run dev`, rồi mở desktop với `ORAL_WEB_URL=http://localhost:3000`.

## Build bộ cài và chạy lại

Các lệnh chạy tại thư mục gốc repository. Đóng app trước khi thay bộ cài.

**Linux / macOS — lần đầu chuẩn bị bundle:**

```bash
git pull --ff-only
npm ci
python3.12 -m venv .venv-stt
.venv-stt/bin/python -m pip install -r scripts/requirements-desktop-stt.txt
.venv-stt/bin/python scripts/build_desktop_stt.py
npm run dist -w apps/desktop
```

Linux có thể cài Torch CPU trước requirements để giảm dung lượng tải:
`.venv-stt/bin/python -m pip install torch==2.6.0 --index-url https://download.pytorch.org/whl/cpu`.

**Windows PowerShell:**

```powershell
git pull --ff-only
npm ci
py -3.12 -m venv .venv-stt
.\.venv-stt\Scripts\python -m pip install -r scripts/requirements-desktop-stt.txt
.\.venv-stt\Scripts\python scripts/build_desktop_stt.py
npm run dist:win -w apps/desktop
```

Kết quả nằm ở `apps/desktop/dist/`: mở `.exe` trên Windows, `.dmg` trên macOS; Linux cài `.deb` hoặc chạy AppImage. Build trên đúng hệ điều hành đích. Ví dụ Ubuntu với bản hiện tại:

```bash
sudo apt install ./apps/desktop/dist/OralAI-0.1.0-linux-amd64.deb
oralai
```

Hoặc chạy không cài đặt:

```bash
chmod +x apps/desktop/dist/OralAI-0.1.0-linux-x86_64.AppImage
./apps/desktop/dist/OralAI-0.1.0-linux-x86_64.AppImage
```

**Chạy lại từ source khi đã có bundle:** chỉ cần `npm ci` khi dependency thay đổi, rồi:

```bash
env -u ELECTRON_RUN_AS_NODE ORAL_WEB_URL=http://localhost:3000 npm run desktop
```

PowerShell: đặt `$env:ORAL_WEB_URL="http://localhost:3000"`, xóa `ELECTRON_RUN_AS_NODE` như hướng dẫn trên rồi `npm run desktop`. Thay URL bằng server của bạn; nếu không đặt biến, app dùng địa chỉ đã lưu trong menu.

**Khi cập nhật code:**

- Đổi giao diện/cấu hình admin/backend: rebuild server bằng `docker compose up -d --build --wait`, đóng rồi mở lại desktop để tải UI mới. Không cần build lại model.
- Đổi Electron/helper/model hoặc đang dùng bộ cài cũ chưa có PhoWhisper: build bundle bằng script, chạy `npm run dist -w apps/desktop`, rồi cài bộ mới. Script dùng lại model đúng revision đã có.
- Chỉ đổi `.env` server: `docker compose up -d --no-deps --force-recreate api worker`. Nếu deploy qua Jenkins, sửa credential `oral-ai-env` và chạy pipeline.

Không cần build thủ công nếu dùng GitHub: Actions → **Desktop installers** → **Run workflow** → chọn nhánh `main`; đợi build rồi tải artifact đúng OS. Workflow này chạy thủ công, push code không tự tạo bộ cài.

## STT trên server do admin chọn

Trong **Cấu hình hệ thống → STT & giọng nói**, Gemini STT dùng `GEMINI_API_KEY` / `GEMINI_STT_MODEL`; Google Cloud STT dùng JSON service account upload ở mục riêng. Lựa chọn STT web không đổi PhoWhisper của desktop. Khi xem bài đã nộp, mở **Nhận dạng lại & chấm lại**, chọn Gemini hoặc Google, nhập lý do rồi gửi yêu cầu.

## Xử lý lỗi

| Lỗi | Kiểm tra |
| --- | --- |
| Bộ cài thiếu STT/model | Cài bản đầy đủ mới; bước đóng gói đã chặn thiếu helper/model |
| Source chưa có model | Chạy `scripts/build_desktop_stt.py` trước `npm run desktop` |
| STT quá thời gian | Thử câu ngắn hơn, đóng tác vụ nặng; mặc định giới hạn xử lý 7 phút |
| RNNoise không tải được | Kiểm tra server đã build/copy tài nguyên `/audio/`; tắt lọc để tiếp tục |
| Không có tiếng | Kiểm tra mic, quyền hệ điều hành, nghe lại bản thử |
| Chưa có điểm | Kiểm tra worker, chế độ demo/luyện tập hoặc trạng thái cần xem lại |

Chi tiết bộ cài và kiểm tra offline: [docs/desktop-build.md](docs/desktop-build.md).
