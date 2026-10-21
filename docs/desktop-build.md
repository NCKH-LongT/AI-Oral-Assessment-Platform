# Build desktop: bản đầy đủ và bản Windows nhẹ

[README](../README.md#hướng-dẫn-theo-nhu-cầu) · [Chạy desktop từ source](../readme-desktop.md#chạy-từ-source)

Bộ cài chứa Electron, helper Python được đóng gói bằng PyInstaller, faster-whisper, CTranslate2, VAD và FFmpeg. Bản đầy đủ kèm model **Whisper-small** đa ngôn ngữ; bản Windows nhẹ tải model ở lần mở đầu. Electron tải giao diện từ máy chủ được chọn. Luồng STT local hỗ trợ tiếng Việt/tiếng Anh, chạy bằng CPU INT8; bài thi mới được nhận dạng/chấm trên server sau khi nộp.

Bản quy định desktop cần server migration `0011`, web/API/worker đồng bộ và build desktop mới. Manifest bao gồm `desktop-policy.cjs`; bridge `policyVersion: 1` truyền mã lượt thi để Electron lấy policy từ server. Khi nghiệm thu, kiểm tra cả cấu hình mặc định và cấu hình tắt camera/màn hình/kiosk; không chỉ refresh web trong Electron cũ. [Các quy định](architecture/user-profiles-desktop-policy.md).

## Thành phần bắt buộc

- `resources/stt/oral-stt/`: helper native của OS/architecture đích.
- `resources/stt/whisper-small/`: model CTranslate2 từ `Systran/faster-whisper-small`, config, tokenizer, vocabulary, license và metadata.
- `scripts/build_desktop_stt.py` ghim revision model, giữ trọng số FP16 và chạy CPU INT8. Model/binary sinh ra được Git bỏ qua. File trung gian PyInstaller nằm trong thư mục tạm của hệ điều hành, tự dọn khi build kết thúc hoặc báo lỗi.
- `check-stt-bundle.cjs` kiểm tra helper/license trước khi đóng gói; bản đầy đủ còn yêu cầu các tệp model. Trên cùng OS, hook kiểm tra protocol 2, Whisper-small và hotword của helper.

## Build trên OS đích

Cần Node 22.12+ và Python 3.12. Tại gốc repository:

```bash
npm ci
python3.12 -m venv .venv-stt
.venv-stt/bin/pip install -r scripts/requirements-desktop-stt.txt
.venv-stt/bin/python scripts/build_desktop_stt.py
npm run check -w apps/desktop
npm run dist -w apps/desktop
```

Windows dùng `.venv-stt\Scripts\python` và `.venv-stt\Scripts\pip`. Helper phải được build trên đúng OS/architecture. Workflow **Desktop installers** thực hiện trên Linux, Windows và macOS. `npm run pack -w apps/desktop` tạo thư mục unpacked để kiểm tra.

Output ở `apps/desktop/dist`: NSIS `.exe`, Linux `.deb`/AppImage, macOS `.dmg`/`.zip`. Bộ cài chưa code-sign/notarize và chưa có auto-update. Máy sinh viên dùng model đi kèm, không cần cài Python riêng.

URL server chọn khi chạy app, qua **Cấu hình máy chủ** hoặc `ORAL_WEB_URL`; xem [cấu hình URL](../readme-desktop.md#đổi-url-máy-chủ-khi-chạy-hoặc-build).

## Bộ cài Windows nhẹ, tự tải model lần đầu

Sau khi chuẩn bị helper STT, chạy `npm run dist:win:light -w apps/desktop`.
File phát hành nằm tại `apps/desktop/dist-light/OralAI-0.1.0-Windows-Setup-Light.exe`.
Bản Windows x64 đã build ngày 21/10/2026 có dung lượng khoảng **203 MB (194 MiB)**,
so với bản đầy đủ khoảng 639 MB (609 MiB); dung lượng thay đổi theo phiên bản runtime.
Bộ cài chứa Electron và helper STT; không chứa trọng số Whisper. Sinh viên không
cần cài Node, Python, Docker hoặc thư viện riêng, không cần quyền admin mặc định.

Khi mở lần đầu, app tự tải khoảng 464 MiB model từ Hugging Face theo revision
được ghim trong `model-manifest.json`, hiển thị tiến độ và kiểm tra SHA-256 cho
từng tệp trước khi sử dụng. Mỗi tệp tự thử lại tối đa 3 lần khi mạng lỗi; nút
Thử tải lại tiếp tục giữ các tệp đã hoàn tất. Tệp lớn đang tải dở sẽ tải lại.
Model nằm tại thư mục dữ liệu người dùng `OralAI/stt/whisper-small`, ngoài thư
mục cài đặt, nên cập nhật app không cần tải lại model. Không chia sẻ profile
hoặc cookie của máy build trong bộ cài. Lần chạy đầu mặc định kết nối
`https://oral-test.paperlens.uk`; có thể đổi tại Cấu hình máy chủ.

Dung lượng bộ cài giảm nhưng tổng dung lượng sau khi tải model vẫn cần cho
Electron, helper và khoảng 464 MiB model. Cần Internet để thiết lập lần đầu,
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
.venv-stt\Scripts\python scripts/build_desktop_stt.py
npm run check -w apps/desktop
npm run test:desktop
npm run dist:win:light -w apps/desktop
```

Script chuẩn bị hiện vẫn tải model trên máy build để kiểm tra helper thật; cấu
hình `electron-builder.light.cjs` loại trọng số model khỏi bộ cài. Trên Windows,
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

Kiểm tra bản Windows nhẹ thật trên profile trống (có tải khoảng 464 MiB):

```powershell
$env:ORAL_TEST_DOWNLOAD = "1"
$env:ORAL_TEST_DESKTOP_EXE = (Resolve-Path "apps/desktop/dist-light/win-unpacked/oralai.exe").Path
npm run test:desktop-first-run
```

Test xác minh màn hình tiến độ, tải và kiểm tra model thật, nạp model bằng
helper đóng gói, mở đăng nhập online với bố cục gọn và khởi động lại không tải
lại model. Test này mặc định bỏ qua nếu chưa đặt `ORAL_TEST_DOWNLOAD=1`.
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
