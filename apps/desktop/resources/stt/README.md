# Tài nguyên STT offline

Chạy `python scripts/build_desktop_stt.py` từ gốc repository trên đúng OS/architecture để tạo:

- `oral-stt/`: helper native cùng runtime, VAD và FFmpeg.
- `whisper-small/`: Whisper-small đa ngôn ngữ, trọng số FP16, runtime CPU INT8, license MIT và revision cố định.

Bộ cài kiểm tra helper trước khi đóng gói. Desktop cố định Whisper-small, hỗ trợ chọn tiếng Việt/tiếng Anh. Các thư mục sinh ra được Git bỏ qua. Dùng `python scripts/build_desktop_stt.py --runtime-only` để chỉ build helper, không tải model trên máy build.

Bản Windows nhẹ (`npm run dist:win:light -w apps/desktop`) chỉ đóng gói
`oral-stt/` và `WHISPER-LICENSE.txt`. Các bản cài mặc định không chứa model và không tự tải khi mở app. Admin bật **Cho phép học sinh tải Whisper để thử STT trên desktop** trong cấu hình giọng nói; học sinh bấm **Tải Whisper-small** để tải khoảng 464 MiB từ
revision cố định trong `apps/desktop/model-manifest.json`, kiểm tra kích thước
và SHA-256 trước khi đưa vào thư mục dữ liệu người dùng
`OralAI/stt/whisper-small`. Model hoàn tất được dùng lại qua các lần mở/cập nhật
app. Không cần cài Python trên máy sinh viên. Bài thi mới gửi bản ghi lên server để STT/chấm điểm, không yêu cầu model trên máy học sinh. Whisper local dùng cho bài thử thiết bị.

[Hướng dẫn build](../../../../docs/desktop-build.md) · [Chạy desktop](../../../../readme-desktop.md)
