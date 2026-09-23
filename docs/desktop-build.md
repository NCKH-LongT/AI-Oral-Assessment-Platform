# Build bộ cài desktop có STT offline

[README / danh mục tài liệu](../README.md#hướng-dẫn-theo-nhu-cầu)

Hướng dẫn từng bước chạy lại source, cài đè và build trên Linux/Windows: [readme-desktop.md](../readme-desktop.md#build-bộ-cài-và-chạy-lại).

Đổi server: xem [URL khi chạy và build](../readme-desktop.md#đổi-url-máy-chủ-khi-chạy-hoặc-build). Bộ cài hiện không nhúng URL lúc build; chọn URL trong app sau khi cài hoặc truyền `ORAL_WEB_URL` khi chạy. `./run-desktop.sh` dùng `--server`.

Để chạy code đang sửa, dùng `./run-desktop.sh` tại repository: UI dev riêng và Electron dùng đúng source hiện tại, kết nối server đã chạy sẵn. Script không build/khởi động Docker. Đây là luồng phát triển, không tạo bộ cài; muốn phân phối vẫn build theo các bước dưới.

## Thành phần bắt buộc

- Electron tải UI từ server được chọn.
- Helper `resources/stt/oral-stt/`: Python đóng gói bằng PyInstaller, faster-whisper, CTranslate2, VAD và FFmpeg.
- Model `resources/stt/model/`: PhoWhisper-small của VinAI, chuyển INT8 bằng CTranslate2; kèm tokenizer, preprocessing config, license và metadata revision.
- RNNoise WASM/AudioWorklet được phục vụ cùng UI tại `/audio/`; xử lý âm thanh tại máy học viên, không gửi audio đến dịch vụ lọc nhiễu.
- Runtime sửa chính tả `node-llama-cpp` là dependency production của desktop. Native binaries được unpack khỏi ASAR theo `asarUnpack`; không cần Python hoặc Ollama cho chức năng này. Model Qwen3 tải theo yêu cầu sau cài đặt, không nhúng vào bộ cài.

Model PhoWhisper nguồn được khóa revision trong `scripts/build_desktop_stt.py`. Model/binary sinh ra không đưa vào Git. Bộ cài lớn hơn trước vì chứa đầy đủ model STT. Không còn tùy chọn `bundle_stt=false`; `beforePack` từ chối tạo installer thiếu helper/model STT. Điều kiện này không áp dụng cho Qwen3 sửa chính tả.

## Model sửa chính tả tùy chọn

Không cần tải Qwen3 để build bộ cài, chạy STT hay làm bài thi. Runtime sửa chính tả được đóng gói để người dùng có thể dùng tính năng sau này; trọng số Qwen3 chỉ tải khi bấm **Tải model sửa chính tả (1,28 GB)**. Không tự tải lúc cài/mở app hoặc khi dừng ghi âm. Xem [hướng dẫn tải, bỏ qua và hủy tải](transcript-correction.md).

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

Chạy `node --test tests/desktop-exit.integration.cjs` trên môi trường có thể mở Electron để kiểm tra nút X và IPC thoát thật: chọn ở lại giữ cửa sổ, chọn rời trang đóng tiến trình. Test dùng server/profile tạm, không truy cập bài thi thật. CI Linux không có màn hình cần chạy qua `xvfb-run -a`. Bản đóng gói phải có `unload-guard.cjs` và preload mới; chỉ cập nhật web không sửa được desktop cũ bị chặn đóng.

Để kiểm tra chính bản đóng gói, đặt `ORAL_TEST_DESKTOP_EXE` tới executable trong thư mục unpacked rồi chạy `npm run test:desktop-exit`; Windows dùng `apps/desktop/dist/win-unpacked/oralai.exe`. Test mặc định chạy Electron source khi không đặt biến này.

Chạy `npm run test:desktop` để kiểm tra quyền media, URL đăng nhập, tải/cache/checksum/hủy model và giới hạn transcript. Chạy `python -m unittest discover -s tests -p test_desktop_stt.py -v` để kiểm tra transcript tiếng Việt qua pipe Windows; `--check` chỉ kiểm tra nạp model và không thay thế kiểm thử xuất transcript.

Với bản đóng gói, thử cả hai lựa chọn:

1. Profile chưa tải Qwen3: bỏ qua tải model, ghi âm, STT và nộp bài. Đảm bảo không phát sinh tải model sửa chính tả tự động. Thử hủy tải hoặc gặp lỗi mạng rồi tiếp tục thi.
2. Có tải Qwen3: tải từ UI rồi thử gợi ý một câu khi không có mạng; đảm bảo bản đề xuất chỉ được áp dụng khi bấm nút và runtime native được nạp từ bộ cài. Kết nối lại server trước khi nộp bài.

Kiểm thử giao diện tự động: chạy web source rồi `npx playwright test tests/e2e/desktop-stt.spec.ts` (đặt `E2E_BASE_URL` nếu web không ở cổng 3000). Bộ test có cả luồng tải model và luồng bỏ qua tải; bridge STT/sửa chính tả được giả lập, không tải Qwen3 thật.

Script build tự chạy helper `--check` để nạp model cục bộ. Trên Linux, sau khi pack:

```bash
HF_HUB_OFFLINE=1 apps/desktop/dist/linux-unpacked/resources/stt/oral-stt/oral-stt --check
HF_HUB_OFFLINE=1 apps/desktop/dist/linux-unpacked/resources/stt/oral-stt/oral-stt sample.wav
```

Thử thêm trên máy sạch không có Python: mở app, ghi mic 10 giây, phát bản gốc/bản lọc, làm một bài thi và xem kết quả. Mất mạng không ảnh hưởng STT cục bộ nhưng app vẫn cần server để lấy đề/nộp bài.

## Attribution

Model: [VinAI PhoWhisper](https://github.com/VinAIResearch/PhoWhisper), BSD-3-Clause; license nằm trong resources. Engine: [faster-whisper](https://github.com/SYSTRAN/faster-whisper). Noise suppression: [web-noise-suppressor](https://github.com/sapphi-red/web-noise-suppressor), RNNoise qua WebAssembly/AudioWorklet. Các dependency được đóng gói phải giữ license đi kèm.
