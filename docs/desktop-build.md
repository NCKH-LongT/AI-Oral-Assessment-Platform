# Build desktop và tải Whisper tùy chọn

[README](../README.md#hướng-dẫn-theo-nhu-cầu) · [Chạy desktop từ source](../readme-desktop.md#chạy-từ-source)

Bộ cài chứa Electron, helper Python được đóng gói bằng PyInstaller, faster-whisper, CTranslate2, VAD và FFmpeg. Các bản cài mặc định không chứa model và không tự tải khi mở app. Electron tải giao diện từ máy chủ được chọn. Whisper local dùng cho bài thử thiết bị; bài thi mới được nhận dạng/chấm trên server sau khi nộp.

## Thành phần bắt buộc

- `resources/stt/oral-stt/`: helper native của OS/architecture đích.
- `resources/stt/whisper-small/`: tùy chọn cho phát triển local, không đóng gói mặc định.
- `scripts/build_desktop_stt.py` ghim revision model, giữ trọng số FP16 và chạy CPU INT8. Model/binary sinh ra được Git bỏ qua. File trung gian PyInstaller nằm trong thư mục tạm của hệ điều hành, tự dọn khi build kết thúc hoặc báo lỗi.
- `check-stt-bundle.cjs` kiểm tra helper/license trước khi đóng gói. Trên cùng OS, hook kiểm tra protocol 2, Whisper-small và hotword của helper.

## Build trên OS đích

Cần Node 22.12+ và Python 3.12. Tại gốc repository:

```bash
npm ci
python3.12 -m venv .venv-stt
.venv-stt/bin/pip install -r scripts/requirements-desktop-stt.txt
.venv-stt/bin/python scripts/build_desktop_stt.py --runtime-only
npm run check -w apps/desktop
npm run dist -w apps/desktop
```

Windows dùng `.venv-stt\Scripts\python` và `.venv-stt\Scripts\pip`. Helper phải được build trên đúng OS/architecture. Workflow **Desktop installers** thực hiện trên Linux, Windows và macOS. `npm run pack -w apps/desktop` tạo thư mục unpacked để kiểm tra.

Output ở `apps/desktop/dist`: NSIS `.exe`, Linux `.deb`/AppImage, macOS `.dmg`/`.zip`. Bộ cài chưa có auto-update. Máy sinh viên không cần cài Python riêng.

URL server chọn khi chạy app, qua **Cấu hình máy chủ** hoặc `ORAL_WEB_URL`; xem [cấu hình URL](../readme-desktop.md#đổi-url-máy-chủ-khi-chạy-hoặc-build).

## Cảnh báo Windows và ký số

Kiểm tra chữ ký bằng `Get-AuthenticodeSignature .\release\OralAI-0.1.0-Windows-Setup-Light.exe`. Bản build không có chứng thư sẽ hiện `NotSigned`; SmartScreen có thể cảnh báo vì chưa nhận diện nhà phát hành hoặc ứng dụng chưa đủ uy tín. Đây không phải bằng chứng kết luận có mã độc. Nếu Defender báo tên mối đe dọa cụ thể, cần kiểm tra cảnh báo đó riêng.

Để phát hành có tên nhà phát hành xác thực, cấu hình chứng thư Authenticode hợp lệ qua `CSC_LINK` (đường dẫn PFX hoặc secret CI) và `CSC_KEY_PASSWORD` trước khi chạy electron-builder. Không commit chứng thư/mật khẩu. Ký số không bảo đảm bản phát hành mới hết cảnh báo ngay; Microsoft còn đánh giá uy tín. Xem [hướng dẫn SmartScreen của Microsoft](https://learn.microsoft.com/windows/apps/package-and-deploy/smartscreen-reputation). Không cần tắt Defender/SmartScreen để build. Chưa có chứng thư trong môi trường build thì bản xuất vẫn chưa ký số.

Phải triển khai API và admin-web mới cùng desktop để có công tắc quyền tải. Desktop kết nối server cũ thiếu trường quyền sẽ từ chối tải, vẫn mở app và nộp bài bình thường.

## Bộ cài Windows nhẹ, tải model theo quyền admin

Sau khi chuẩn bị helper STT, chạy `npm run dist:win:light -w apps/desktop`.
File phát hành nằm tại `apps/desktop/dist-light/OralAI-0.1.0-Windows-Setup-Light.exe`.
Bản Windows x64 đã build ngày 21/10/2026 có dung lượng khoảng **203 MB (194 MiB)**,
so với bản đầy đủ khoảng 639 MB (609 MiB); dung lượng thay đổi theo phiên bản runtime.
Bộ cài chứa Electron và helper STT; không chứa trọng số Whisper. Sinh viên không
cần cài Node, Python, Docker hoặc thư viện riêng, không cần quyền admin mặc định.

App mở thẳng giao diện máy chủ, không bắt tải model. Admin bật **Cho phép học sinh tải Whisper để thử STT trên desktop** trong cấu hình giọng nói (mặc định tắt). Học sinh bấm **Tải Whisper-small** trong phần thử thiết bị để tải khoảng 464 MiB từ Hugging Face theo revision được ghim trong `model-manifest.json`. Desktop kiểm tra quyền lại bằng phiên đăng nhập hiện tại trước mỗi yêu cầu tải và không cho tải trong lúc thi. Trình tải kiểm tra kích thước/SHA-256 trước khi sử dụng, tự thử lại tối đa 3 lần và giữ các tệp đã hoàn tất khi thử lại.
Model nằm tại thư mục dữ liệu người dùng `OralAI/stt/whisper-small`, ngoài thư
mục cài đặt, nên cập nhật app không cần tải lại model. Không chia sẻ profile
hoặc cookie của máy build trong bộ cài. Lần chạy đầu mặc định kết nối
`https://oral-test.paperlens.uk`; có thể đổi tại Cấu hình máy chủ.

Dung lượng bộ cài giảm nhưng tổng dung lượng sau khi tải model vẫn cần cho
Electron, helper và khoảng 464 MiB model nếu học sinh chọn tải. Cần Internet để
đăng nhập, lấy đề và nộp bài. Đây không phải bản thi hoàn toàn offline.

`desktop.css` được đóng gói cùng Electron và áp dụng cho server đã chọn: bỏ
khoảng trống sidebar web, giữ câu hỏi và thiết bị cạnh nhau, giới hạn bố cục
theo chiều cao cửa sổ. Nội dung dài cuộn trong từng vùng, vẫn giữ nguyên nội
dung câu hỏi, thông báo và các bước đồng ý ghi hình.

Kiểm tra trình tải: `node --test tests/desktop-model-installer.test.cjs`.

Build trên Windows PowerShell sau khi cài Node 22.12+ và Python 3.12:

```powershell
npm ci
py -3.12 -m venv .venv-stt
.venv-stt\Scripts\pip install -r scripts/requirements-desktop-stt.txt
.venv-stt\Scripts\python scripts/build_desktop_stt.py --runtime-only
npm run check -w apps/desktop
npm run test:desktop
npm run dist:win:light -w apps/desktop
```

Tùy chọn `--runtime-only` không tải model trên máy build. Bỏ tùy chọn để chuẩn bị model và kiểm tra nạp model khi phát triển local. Trên Windows,
script chọn DLL Visual C++ hệ thống để tránh đóng gói runtime cũ từ `PATH` gây
lỗi khi nạp CTranslate2. Bộ cài không chứa `.env`, profile hoặc cookie.

## Kiểm tra trước phát hành

```bash
npm run test:desktop
python3 -m unittest discover -s tests -p test_desktop_stt.py
E2E_BASE_URL=http://localhost:3001 npx playwright test tests/e2e/desktop-stt.spec.ts tests/e2e/desktop-speech-settings.spec.ts
```

Kiểm tra bố cục Electron với web UI chạy riêng tại `http://127.0.0.1:3100`:

```powershell
# Terminal 1
npm run dev -w apps/admin-web -- --hostname 127.0.0.1 --port 3100
# Terminal 2
npm run test:desktop-layout
```

Kiểm tra bản Windows nhẹ thật trên profile trống (không tải model):

```powershell
$env:ORAL_TEST_DESKTOP_EXE = (Resolve-Path "apps/desktop/dist-light/win-unpacked/oralai.exe").Path
npm run test:desktop-first-run
```

Test dùng server HTTP cục bộ, xác minh app mở thẳng giao diện và không tải model, rồi kiểm tra IPC từ chối tải khi server không cho phép. Test không cần kết nối server thật hoặc tải 464 MiB.
Xem kết quả và giới hạn kiểm chứng tại [biên bản kiểm thử](validation.md).

Kiểm thử UI giả lập bridge STT: model cố định dù profile lưu lựa chọn khác, ngôn ngữ và khóa lựa chọn khi bận, nhận dạng lỗi/thử lại, transcript ẩn và payload nộp vẫn đúng. Camera/mic dùng thiết bị giả lập Chromium. Kiểm thử Python kiểm tra JSON tiếng Việt qua pipe Windows, ngôn ngữ, hotword và model mặc định.

Script build chạy `--capabilities` và `--check`. Có thể thử helper Linux đã pack:

```bash
HF_HUB_OFFLINE=1 apps/desktop/dist/linux-unpacked/resources/stt/oral-stt/oral-stt --check
STT_LANGUAGE=en HF_HUB_OFFLINE=1 apps/desktop/dist/linux-unpacked/resources/stt/oral-stt/oral-stt sample.wav
```

Kiểm tra Electron thực với một file nói ngắn:

```bash
ORAL_STT_TEST_AUDIO=/path/to/sample.wav npm run test:desktop-stt
```

Test dùng profile và trang local riêng, gọi IPC/helper với tiếng Việt/Anh, kiểm tra metadata và transcript có nội dung. Đây là kiểm tra tích hợp, không phải benchmark nhận dạng.

Trên máy sạch, cấp quyền/chọn mic và camera, chuẩn bị màn hình, ghi và nộp câu trả lời. Xác nhận trạng thái nhận dạng, bản ghi màn hình, audio/video và transcript tại giao diện giảng viên. App vẫn cần server để lấy đề/nộp bài. Tự tắt màn hình phụ trên Ubuntu/GNOME cần Python hệ thống và `python3-gi`; xem [giám sát desktop](../readme-desktop.md#truy-cập-và-ghi-màn-hình-bắt-buộc).

## Attribution

[OpenAI Whisper](https://github.com/openai/whisper), MIT; bản CTranslate2 từ [SYSTRAN](https://huggingface.co/Systran/faster-whisper-small). `WHISPER-LICENSE.txt` được sao chép vào model và bộ cài. Engine: [faster-whisper](https://github.com/SYSTRAN/faster-whisper). Các dependency phân phối kèm phải giữ license đi cùng.
