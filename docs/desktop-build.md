# Build bộ cài desktop có STT offline

Hướng dẫn từng bước chạy lại source, cài đè và build trên Linux/Windows: [readme-desktop.md](../readme-desktop.md#build-bộ-cài-và-chạy-lại).

Để chạy code đang sửa, dùng `./run-desktop.sh` tại repository: UI dev riêng và Electron dùng đúng source hiện tại, kết nối server đã chạy sẵn. Script không build/khởi động Docker. Đây là luồng phát triển, không tạo bộ cài; muốn phân phối vẫn build theo các bước dưới.

## Thành phần bắt buộc

- Electron tải UI từ server được chọn.
- Helper `resources/stt/oral-stt/`: Python đóng gói bằng PyInstaller, faster-whisper, CTranslate2, VAD và FFmpeg.
- Model `resources/stt/model/`: PhoWhisper-small của VinAI, chuyển INT8 bằng CTranslate2; kèm tokenizer, preprocessing config, license và metadata revision.
- RNNoise WASM/AudioWorklet được phục vụ cùng UI tại `/audio/`; xử lý âm thanh tại máy học viên, không gửi audio đến dịch vụ lọc nhiễu.
- Runtime sửa chính tả `node-llama-cpp` là dependency production của desktop. Native binaries được unpack khỏi ASAR theo `asarUnpack`; không cần Python hoặc Ollama cho chức năng này. Model Qwen3 tải theo yêu cầu sau cài đặt, không nhúng vào bộ cài.

Model nguồn được khóa revision trong `scripts/build_desktop_stt.py`. Model/binary sinh ra không đưa vào Git. Bộ cài lớn hơn trước vì chứa đầy đủ model. Không còn tùy chọn `bundle_stt=false`; `beforePack` từ chối tạo installer thiếu helper/model.

Model sửa chính tả dùng manifest ghim URL/revision/SHA-256 trong `apps/desktop/correction.cjs`; dung lượng 1.282.439.264 byte, Qwen3 theo license Apache-2.0. Khi nâng model cần cập nhật cả manifest, nhãn dung lượng trong UI/hướng dẫn và thử lại chất lượng tiếng Việt. Build native runtime trên đúng OS/architecture; không dùng `npm ci --omit=optional` vì các binary `@node-llama-cpp` nằm trong optional dependencies. Xem [hướng dẫn Electron của runtime](https://node-llama-cpp.withcat.ai/guide/electron).

## Build trên OS/architecture đích

Cần Node 22.12+, Python 3.12. Từ thư mục gốc repository:

```bash
npm ci
python3.12 -m venv .venv-stt
.venv-stt/bin/pip install -r scripts/requirements-desktop-stt.txt
.venv-stt/bin/python scripts/build_desktop_stt.py
npm run check -w apps/desktop
npm run dist -w apps/desktop
```

Windows dùng `.venv-stt\Scripts\python` và `.venv-stt\Scripts\pip`. Build helper trên đúng OS/architecture, không chép helper Linux sang Windows/macOS. Workflow **Desktop installers** thực hiện các bước này trên ba runner. Model được tải/chuyển ở máy build; người cài app không cần tải lại.

Linux có thể cài trước `torch==2.6.0` từ `https://download.pytorch.org/whl/cpu` để tránh tải dependency CUDA không dùng; CI áp dụng cách này. Torch chỉ dùng lúc chuyển model, không nằm trong bộ cài.

Output ở `apps/desktop/dist`: Windows NSIS `.exe`; Linux `.deb`/AppImage; macOS `.dmg`/`.zip`. Dùng `npm run pack -w apps/desktop` để tạo thư mục unpacked. Bộ cài hiện chưa code-sign/notarize và chưa có auto-update.

## Kiểm tra trước phát hành

Chạy `npm run test:desktop` để kiểm tra quyền media, URL đăng nhập, tải/cache/checksum/hủy model và giới hạn transcript. Với bản đóng gói, tải model từ UI rồi thử sửa một câu khi không có mạng; đảm bảo bản đề xuất chỉ được áp dụng khi bấm nút và model native được nạp từ bộ cài.

Script build tự chạy helper `--check` để nạp model cục bộ. Trên Linux, sau khi pack:

```bash
HF_HUB_OFFLINE=1 apps/desktop/dist/linux-unpacked/resources/stt/oral-stt/oral-stt --check
HF_HUB_OFFLINE=1 apps/desktop/dist/linux-unpacked/resources/stt/oral-stt/oral-stt sample.wav
```

Thử thêm trên máy sạch không có Python: mở app, ghi mic 10 giây, phát bản gốc/bản lọc, làm một bài thi và xem kết quả. Mất mạng không ảnh hưởng STT cục bộ nhưng app vẫn cần server để lấy đề/nộp bài.

## Attribution

Model: [VinAI PhoWhisper](https://github.com/VinAIResearch/PhoWhisper), BSD-3-Clause; license nằm trong resources. Engine: [faster-whisper](https://github.com/SYSTRAN/faster-whisper). Noise suppression: [web-noise-suppressor](https://github.com/sapphi-red/web-noise-suppressor), RNNoise qua WebAssembly/AudioWorklet. Các dependency được đóng gói phải giữ license đi kèm.
