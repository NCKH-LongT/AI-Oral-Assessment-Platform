# OralAI Desktop

[README / danh mục tài liệu](README.md#hướng-dẫn-theo-nhu-cầu)

Bộ cài desktop bao gồm runtime Python đóng gói, FFmpeg và **PhoWhisper-small INT8**. Nhận dạng chạy trên CPU của máy học viên, không cần cài Python riêng hoặc tải thêm model STT. LLM chấm bài chạy trên server.

Đi nhanh: [chọn server](#đổi-url-máy-chủ-khi-chạy-hoặc-build) · [kiểm tra mic](#kiểm-tra-mic-trước-khi-thi) · [làm bài](#khi-làm-bài) · [kiểm tra transcript](docs/transcript-correction.md) · [build và cập nhật](#build-bộ-cài-và-chạy-lại) · [xử lý lỗi](#xử-lý-lỗi).

## Bắt đầu nhanh

| Tình huống | Cách mở |
| --- | --- |
| Học viên đã cài OralAI | Mở app, chọn server trong **OralAI → Cấu hình máy chủ…**, đăng nhập và làm bài |
| Đã có source, dependency và bundle STT; muốn tải giao diện đang triển khai | Chạy `npm run desktop` với môi trường và URL như ví dụ bên dưới |
| Đang sửa giao diện trong repo trên Linux/macOS | Chạy `./run-desktop.sh --server http://localhost:3000` để mở UI dev tại cổng 3001 |
| Chưa có dependency hoặc bundle STT | Hoàn tất mục [Chạy từ source](#chạy-từ-source) trước |

Mở desktop từ source, dùng server local đã chạy, trên Linux/macOS:

```bash
env -u ELECTRON_RUN_AS_NODE ORAL_WEB_URL=http://localhost:3000 npm run desktop
```

Windows PowerShell:

```powershell
Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
$env:ORAL_WEB_URL = "http://localhost:3000"
npm run desktop
```

Chạy lệnh tại thư mục gốc repository. Thay URL bằng địa chỉ server thực tế nếu dùng máy chủ khác. `npm run desktop` chỉ mở Electron, không chạy backend hoặc build giao diện. `./run-desktop.sh` cũng cần backend đã chạy sẵn.

Nếu dùng Docker local và server chưa chạy:

```bash
docker compose up -d --build --wait
```

Lần đầu cần chuẩn bị `.env` theo [hướng dẫn server](README.md#chạy-server). Server triển khai qua Jenkins được cập nhật theo [hướng dẫn Jenkins](docs/jenkins.md). Admin xem [hướng dẫn tạo môn và giao bài](docs/user-guide.md).

## Đổi URL máy chủ khi chạy hoặc build

Desktop cần **URL web gốc**, nơi có cả giao diện và `/api`, ví dụ `https://oral.example.edu` hoặc `http://localhost:3000`. Không nhập `/api` phía sau, không trỏ trực tiếp tới FastAPI cổng 8000. Thay domain ví dụ bên dưới bằng server thật của bạn. Máy chủ ở máy khác cần HTTPS với chứng chỉ được máy học viên tin cậy; HTTP chỉ hỗ trợ localhost. Trên PC học viên, `localhost` là chính PC đó.

### Chạy UI mới từ source — Linux/macOS

```bash
# Backend Docker trên cùng máy
./run-desktop.sh --server http://localhost:3000

# Backend ở máy chủ khác
./run-desktop.sh --server https://oral.example.edu

# Đổi cả cổng UI dev nếu 3001 đang bận
./run-desktop.sh --server https://oral.example.edu --port 3002
```

`--server` là backend mà UI dev gọi tới; UI mới vẫn chạy trên localhost. Script tự đặt `API_INTERNAL_URL=<server>/api` và origin đăng nhập Google. Backend cần cho phép origin UI dev trong `ALLOWED_ORIGINS`, ví dụ `http://localhost:3001` hoặc `http://localhost:3002`. Script không chạy Docker và không cập nhật backend.

### Mở trực tiếp giao diện từ server

Linux/macOS, chạy tại thư mục repository:

```bash
env -u ELECTRON_RUN_AS_NODE ORAL_WEB_URL=https://oral.example.edu npm run desktop
```

Windows PowerShell:

```powershell
Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
$env:ORAL_WEB_URL = "https://oral.example.edu"
npm run desktop
```

Cách này tải giao diện đã triển khai trên server; sửa source UI trên máy chưa làm giao diện server thay đổi. `ORAL_WEB_URL` được đọc từ môi trường tiến trình lúc chạy, không tự đọc từ file `.env` của backend. Biến này ưu tiên URL đã lưu trong app. Để lần khởi động sau dùng URL đã lưu, bỏ biến bằng `unset ORAL_WEB_URL` (Bash) hoặc `Remove-Item Env:ORAL_WEB_URL -ErrorAction SilentlyContinue` (PowerShell).

### Build bộ cài để dùng với server khác

**Hiện bộ cài không nhúng URL riêng lúc build.** Build một bộ cài, sau đó chọn server khi mở app lần đầu hoặc tại **OralAI → Cấu hình máy chủ…**. Địa chỉ được lưu riêng trên từng máy và dùng lại ở lần mở sau. Đặt `ORAL_WEB_URL` trước `npm run dist` không ghi biến này vào bộ cài.

Sau khi chuẩn bị bundle STT theo mục [Build bộ cài và chạy lại](#build-bộ-cài-và-chạy-lại):

```bash
# Linux/macOS: build trên đúng hệ điều hành đích
npm run dist -w apps/desktop
```

```powershell
# Windows PowerShell
npm run dist:win -w apps/desktop
```

Cài artifact trong `apps/desktop/dist/`, mở app và nhập `https://oral.example.edu` vào màn hình cấu hình. Không cần build lại để đổi server. Nếu dùng Google login, domain gốc trong admin và callback OAuth phải cùng server đã chọn, ví dụ `https://oral.example.edu/api/auth/google/callback`.

Cũng có thể truyền URL khi **chạy app đã cài**, sau khi đóng phiên app cũ:

```bash
# Linux: bản .deb
env -u ELECTRON_RUN_AS_NODE ORAL_WEB_URL=https://oral.example.edu oralai

# macOS: bộ cài đặt trong /Applications
env -u ELECTRON_RUN_AS_NODE ORAL_WEB_URL=https://oral.example.edu /Applications/OralAI.app/Contents/MacOS/OralAI
```

```powershell
# Windows: thay đường dẫn bằng vị trí OralAI.exe đã cài thực tế
Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
$env:ORAL_WEB_URL = "https://oral.example.edu"
& "C:\duong-dan-cai-dat\OralAI.exe"
```

`API_INTERNAL_URL` là cấu hình proxy của **web Next.js**, không phải biến đổi server cho bộ cài Electron. Chỉ cần tự đặt biến này khi chạy/build web riêng; launcher đã đặt giúp bạn khi dùng `--server`.

## Một lệnh mở app từ code mới — Linux/macOS

Trong thư mục repository, chạy:

```bash
./run-desktop.sh
```

Script chỉ mở giao diện **dev tại http://localhost:3001** và Electron, kết nối server có sẵn tại `http://localhost:3000`. Không chạy lệnh Docker, build server, cài dependency hay sửa cấu hình server. Sửa giao diện sẽ tự cập nhật; sửa Electron thì đóng app và chạy lại script. Backend do bạn chạy/cập nhật riêng. Script dùng profile dev riêng nên cần đăng nhập lại lần đầu; bỏ qua `ORAL_WEB_URL` cũ và gỡ `ELECTRON_RUN_AS_NODE` khỏi tiến trình con.

Cần server đang chạy, Node 22.12+, Python 3, dependency đã cài bằng `npm ci` và bundle PhoWhisper đã build theo hướng dẫn bên dưới. Sửa helper STT/model thì build lại bundle trước khi chạy script. Script không đọc/sửa `.env` hoặc tự tải code từ Git.

Docker mặc định dùng cổng **3000**: `./run-desktop.sh --server http://localhost:3000` (tương đương lệnh không tham số). Chỉ đổi `--server` nếu server thực sự chạy ở địa chỉ/cổng khác; tham số này không đổi cổng Docker. Dùng URL web gốc, không thêm `/api`. Nếu server chưa chạy, script báo rõ rồi dừng.

Để đăng nhập/nộp bài từ UI dev, thêm `http://localhost:3001` vào `ALLOWED_ORIGINS` của API (giữ các origin đang có). Nếu đổi `--port`, thêm origin tương ứng. Bạn tự áp dụng cấu hình này khi chạy server; script không thay cấu hình hoặc khởi động lại Docker.

Đăng nhập Google dùng domain của **server**, không dùng cổng UI dev. Launcher tự truyền `ORAL_AUTH_ORIGIN` bằng giá trị `--server` cho Electron chạy từ source. Với cấu hình mặc định, giữ domain gốc của backend là `http://localhost:3000` và callback Google là `http://localhost:3000/api/auth/google/callback`; không đổi sang 3001. Địa chỉ `--server` cần khớp domain gốc đã cấu hình trong admin. Bộ cài desktop dùng domain máy chủ đã chọn trong app và không nhận override đăng nhập dành cho dev này.

Cổng bận: `./run-desktop.sh --port 3002`. Script từ chối dùng một dev server đang chạy để tránh mở nhầm bản cũ. Đóng Electron hoặc Ctrl+C sẽ dừng dev server của phiên đó; server đang dùng không bị thay đổi. Lệnh `npm run desktop` đơn thuần chỉ mở Electron, không build hoặc cập nhật giao diện ở địa chỉ server.

Có thể chạy lại ngay sau khi đóng app; kết nối TCP cũ ở trạng thái `TIME_WAIT` không bị tính là chiếm cổng. Nếu vẫn báo cổng 3001 bận, kiểm tra bằng `ss -ltnp 'sport = :3001'` trên Linux và đóng phiên đang dùng cổng. Khởi động lại Docker không giải phóng cổng của UI dev trên máy.

Sau **Cho phép camera & mic**, phần **Nghe lại bản ghi kiểm tra** luôn hiển thị. Bấm **Kiểm tra độ ồn**, chờ thu xong 10 giây; app cuộn tới phần phát lại. Chọn checkbox **Nghe bản đã lọc nhiễu RNNoise** rồi bấm **Phát bản đã lọc nhiễu**, hoặc bỏ chọn để **Phát bản gốc**. Nếu bộ lọc lỗi, có thông báo và bản gốc vẫn nghe được khi đã thu thành công.

## Cài và kết nối

Tải artifact từ GitHub Actions → **Desktop installers**. Windows dùng `.exe`, Ubuntu dùng `.deb` hoặc AppImage, macOS dùng `.dmg`. Bộ cài chưa ký số/notarize. Chọn đúng OS/kiến trúc máy.

Mở **OralAI → Cấu hình máy chủ…**, nhập domain HTTPS hoặc `http://localhost:3000` nếu server trên cùng máy. Không thêm `/api`. `ORAL_WEB_URL` nếu có sẽ ưu tiên domain đã lưu.

## Kiểm tra mic trước khi thi

Có thể thu thử/nghe lại trước khi bắt đầu tính giờ. **Gain microphone** từ −12 đến +18 dB, mặc định 0 dB. Tăng từ từ nếu giọng nhỏ, giảm nếu báo âm quá lớn hoặc nghe rè. Gain áp dụng cho bản thu mới (cả audio/video và STT), không sửa bản đã ghi. Đổi gain sẽ xóa bản thử cũ để thu lại. Xem [hướng dẫn chi tiết](docs/microphone-desktop.md).

1. Cấp quyền camera và microphone. Trong mục **Chọn thiết bị**, chọn **Microphone** và **Camera** từ danh sách; app kết nối ngay. Tên đầy đủ xuất hiện sau khi cấp quyền.
2. Bấm **Kiểm tra độ ồn**. Ghi khoảng 10 giây: 3 giây đầu giữ im lặng, 7 giây sau nói thử.
3. Bấm phát audio. Checkbox **Nghe bản đã lọc nhiễu RNNoise** đổi giữa bản gốc và bản lọc của cùng đoạn thu.
4. Checkbox **Lọc nhiễu RNNoise khi nhận dạng câu trả lời** quyết định bản audio dùng cho lần STT đầu tiên. App vẫn giữ cả hai bản khi bộ lọc hoạt động.

Danh sách cập nhật khi cắm/rút thiết bị. Không đổi thiết bị khi đang ghi hoặc xử lý/nộp câu trả lời. Đổi mic/camera trước thi sẽ hủy kết quả kiểm tra cũ; kiểm tra lại hoặc chọn bỏ qua. Thiết bị bị rút sẽ báo lỗi để bạn chọn lại, không âm thầm dùng thiết bị khác.

Bản kiểm tra chỉ giữ tạm trong bộ nhớ; kiểm tra lại hoặc rời trang sẽ giải phóng. Không gửi bản kiểm tra lên server. Nếu RNNoise không tải được, app báo lỗi và cho phép tắt lọc để dùng bản gốc. Không phát mic trực tiếp ra loa để tránh hú/vọng.

## Khi làm bài

- App giữ riêng audio/video gốc và audio dùng STT. RNNoise xử lý theo thời gian thực ở 48 kHz; trước PhoWhisper chỉ chuyển về WAV mono 16 kHz, không lọc FFmpeg lần nữa.
- Khi dừng ghi, PhoWhisper nhận dạng local. Bạn xem lại transcript, sau đó gửi transcript và media gốc lên server.
- Muốn nhận dạng lại: chọn **Bản ghi dùng cho STT → Bản gốc / Bản giảm nhiễu RNNoise**, rồi bấm **Thử STT lại**. Lựa chọn chỉ thay đầu vào STT, không đổi media minh chứng. Nếu bộ lọc lỗi lúc ghi, lựa chọn bản giảm nhiễu bị khóa; bản gốc vẫn dùng được. Lỗi STT giữ transcript hiện tại.
- Worker chấm text bằng Gemini hoặc Ollama theo cấu hình đề; app cập nhật kết quả định kỳ. Đừng đóng app trước khi upload và nộp bài hoàn tất.
- Lựa chọn `STT_PROVIDER` của server không đổi desktop sang Google/server STT. Nó chỉ áp dụng cho trình duyệt web. Ngôn ngữ vẫn lấy từ cấu hình server.
- PhoWhisper-small được tinh chỉnh cho tiếng Việt. Có thể chọn tiếng Anh trong policy nhưng chưa benchmark chất lượng; đề tiếng Việt là mục tiêu chính.

App chưa hiện transcript trực tiếp khi đang nói. Với câu Việt xen tiếng Anh, nghe lại và kiểm tra thuật ngữ trước khi nộp. Gợi ý tiếng Anh do admin thấy khi sinh câu hỏi hiện chưa được truyền vào STT.

## Làm lại bài thi

Danh sách bài thi hiển thị số lượt còn lại và **Lịch sử làm bài**. Bấm **Xem lần N** để mở kết quả cũ; bấm **Làm lại bài thi** để tạo lần mới khi còn lượt. Phiên đang làm luôn được tiếp tục, không tạo thêm phiên khi bấm lặp hoặc mở lại app. Mỗi lần mới cần kết nối thiết bị và kiểm tra mic lại.

Admin cấu hình không cho làm lại, cho làm lại N lần hoặc không giới hạn ở đề thi; có thể cấp thêm lượt riêng cho sinh viên trong **Kết quả & xem lại → Quản lý lượt thi**. Hết lượt thì liên hệ admin; không cần xóa bài cũ để cấp thêm lượt. Sau khi admin thay đổi, bấm làm mới danh sách bài thi.

Bản này cần backend đã chạy migration `0004`: cập nhật server bằng `docker compose up -d --build --wait`, rồi mở lại desktop. `./run-desktop.sh` vẫn chỉ chạy UI dev và Electron. Xem [hướng dẫn quản lý lượt thi](docs/architecture/exam-retakes.md).

## Kiểm tra transcript

Sau STT, nghe lại bản ghi và sửa transcript bằng tay nếu cần. Bản chỉnh sửa được đánh dấu để giảng viên đối chiếu. Chức năng gợi ý sửa chính tả bằng LLM và tải model Qwen3 đã được gỡ khỏi desktop.

Nếu đã tải model sửa chính tả ở phiên bản cũ, file đó không còn được sử dụng. Có thể đóng app và xóa thư mục `models/correction` trong profile Electron để giải phóng dung lượng; profile dev mặc định nằm tại `.data/desktop-dev-profile`.

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

Để dùng giao diện đang phát triển trên Linux/macOS, giữ server đang chạy rồi dùng `./run-desktop.sh --server http://localhost:3000`. Script tự mở giao diện tại cổng 3001 và cấu hình kết nối API; xem [một lệnh mở app từ code mới](#một-lệnh-mở-app-từ-code-mới--linuxmacos).

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
- Đổi Electron/preload: người chạy source cập nhật dependency nếu cần rồi mở lại app; người dùng bộ cài cần chạy `npm run dist -w apps/desktop` và cài bản mới. Có thể dùng bundle STT hiện có nếu helper/model không đổi.
- Đổi helper/model hoặc bộ cài cũ chưa có PhoWhisper: build lại bundle bằng script, chạy `npm run dist -w apps/desktop`, rồi cài bộ mới. Script dùng lại model đúng revision đã có.
- Chỉ đổi biến AI/STT của API/worker trong `.env`: `docker compose up -d --no-deps --force-recreate api worker`. Nếu đổi cấu hình dịch vụ khác, áp dụng lại Compose cho dịch vụ tương ứng. Nếu deploy qua Jenkins, sửa credential `oral-ai-env` và chạy pipeline.

Chức năng thuật ngữ/xóa môn cần backend mới cùng giao diện mới; không cần migration riêng ngoài các migration hiện có. Bỏ chức năng sửa chính tả LLM còn thay Electron/preload và dependency: người chạy source cần cập nhật code, chạy `npm ci`, đóng rồi mở lại desktop; người dùng bộ cài cần bộ mới để gỡ runtime cũ. Chỉ bỏ LLM sửa chính tả không yêu cầu build lại PhoWhisper.

Không cần build thủ công nếu dùng GitHub: Actions → **Desktop installers** → **Run workflow** → chọn nhánh `main`; đợi build rồi tải artifact đúng OS. Workflow này chạy thủ công, push code không tự tạo bộ cài.

## STT trên server do admin chọn

Trong **Cấu hình hệ thống → STT & giọng nói**, Gemini STT dùng `GEMINI_API_KEY` / `GEMINI_STT_MODEL`; Google Cloud STT dùng JSON service account upload ở mục riêng. Lựa chọn STT web không đổi PhoWhisper của desktop. Khi xem bài đã nộp, mở **Nhận dạng lại & chấm lại**, chọn Gemini hoặc Google, nhập lý do rồi gửi yêu cầu.

## Xử lý lỗi

**Đóng desktop:** bấm **Thoát ứng dụng**, menu **OralAI → Thoát ứng dụng**, X hoặc Alt+F4. Nếu còn dữ liệu chưa nộp, chọn **Ở lại** để hoàn tất hoặc **Rời trang / thoát** để xác nhận mất phần chưa nộp. Bản desktop cũ có thể bị `beforeunload` chặn X; cần cập nhật bộ cài/Electron source, không chỉ cập nhật web. Xem [hướng dẫn thoát](docs/microphone-desktop.md#đóng-ứng-dụng-desktop).

| Lỗi | Kiểm tra |
| --- | --- |
| `npm run desktop` vẫn thấy giao diện cũ | Lệnh này tải UI từ server đang cấu hình. Cập nhật server hoặc dùng `./run-desktop.sh` để xem UI source mới |
| Launcher báo server chưa sẵn sàng | Khởi động backend hoặc sửa `--server` về đúng URL web gốc; launcher không tự chạy Docker |
| Cổng UI dev 3001 đang bận | Đóng phiên dev cũ hoặc dùng `--port 3002`, đồng thời cho phép origin tương ứng trên backend |
| Bộ cài thiếu STT/model | Cài bản đầy đủ mới; bước đóng gói đã chặn thiếu helper/model |
| Source chưa có model | Chạy `scripts/build_desktop_stt.py` trước `npm run desktop` |
| Windows báo STT thất bại sau khi dừng ghi âm, log có `UnicodeEncodeError` / `cp1252` | Cập nhật bộ cài đã sửa xuất JSON tiếng Việt. Nếu chạy source, build lại bundle STT; chỉ sửa `transcribe.py` không cập nhật `oral-stt.exe` đã đóng gói. |
| STT quá thời gian | Thử câu ngắn hơn, đóng tác vụ nặng; mặc định giới hạn xử lý 7 phút |
| RNNoise không tải được | Kiểm tra server đã build/copy tài nguyên `/audio/`; tắt lọc để tiếp tục |
| Không có tiếng | Kiểm tra mic, quyền hệ điều hành, nghe lại bản thử |
| Chưa có điểm | Kiểm tra worker, chế độ demo/luyện tập hoặc trạng thái cần xem lại |

Chi tiết bộ cài và kiểm tra offline: [docs/desktop-build.md](docs/desktop-build.md).
