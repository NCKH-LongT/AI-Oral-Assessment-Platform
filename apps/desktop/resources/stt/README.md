# Tài nguyên STT offline

Chạy `python scripts/build_desktop_stt.py` từ gốc repository trên đúng OS/architecture để tạo:

- `oral-stt/`: helper native cùng runtime, VAD và FFmpeg.
- `whisper-small/`: Whisper-small đa ngôn ngữ, trọng số FP16, runtime CPU INT8, license MIT và revision cố định.

Bộ cài kiểm tra đầy đủ tài nguyên và khả năng của helper trước khi đóng gói. Desktop cố định Whisper-small, hỗ trợ chọn tiếng Việt/tiếng Anh. Các thư mục sinh ra được Git bỏ qua; model đi kèm bộ cài đầy đủ.

Bản Windows nhẹ (`npm run dist:win:light -w apps/desktop`) chỉ đóng gói
`oral-stt/` và `WHISPER-LICENSE.txt`. Lần mở đầu tải khoảng 464 MiB model từ
revision cố định trong `apps/desktop/model-manifest.json`, kiểm tra kích thước
và SHA-256 trước khi đưa vào thư mục dữ liệu người dùng
`OralAI/stt/whisper-small`. Model hoàn tất được dùng lại qua các lần mở/cập nhật
app. Không cần cài Python trên máy sinh viên; vẫn cần Internet cho thiết lập
ban đầu và các thao tác với server. Script build hiện chuẩn bị cả helper/model
trên máy build để kiểm tra runtime thật, rồi loại model khi đóng gói bản nhẹ.

[Hướng dẫn build](../../../../docs/desktop-build.md) · [Chạy desktop](../../../../readme-desktop.md)
