# Build bộ cài desktop có STT offline

[README](../README.md#hướng-dẫn-theo-nhu-cầu) · [Chạy desktop từ source](../readme-desktop.md#chạy-từ-source)

Bộ cài chứa Electron, helper Python được đóng gói bằng PyInstaller, faster-whisper, CTranslate2, VAD, FFmpeg và model **Whisper-small** đa ngôn ngữ. Electron tải giao diện từ máy chủ được chọn. Sinh viên chọn tiếng Việt/tiếng Anh; nhận dạng chạy bằng CPU INT8.

## Thành phần bắt buộc

- `resources/stt/oral-stt/`: helper native của OS/architecture đích.
- `resources/stt/whisper-small/`: model CTranslate2 từ `Systran/faster-whisper-small`, config, tokenizer, vocabulary, license và metadata.
- `scripts/build_desktop_stt.py` ghim revision model, giữ trọng số FP16 và chạy CPU INT8. Model/binary sinh ra được Git bỏ qua. File trung gian PyInstaller nằm trong thư mục tạm của hệ điều hành, tự dọn khi build kết thúc hoặc báo lỗi.
- `check-stt-bundle.cjs` kiểm tra file bắt buộc trước khi đóng gói; trên cùng OS còn kiểm tra protocol 2, Whisper-small và hotword của helper.

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

## Kiểm tra trước phát hành

```bash
npm run test:desktop
python3 -m unittest discover -s tests -p test_desktop_stt.py
E2E_BASE_URL=http://localhost:3001 npx playwright test tests/e2e/desktop-stt.spec.ts tests/e2e/desktop-speech-settings.spec.ts
```

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
