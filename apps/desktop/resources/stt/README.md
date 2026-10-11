# Tài nguyên STT offline

Chạy `python scripts/build_desktop_stt.py` từ gốc repository trên đúng OS/architecture để tạo:

- `oral-stt/`: helper native cùng runtime, VAD và FFmpeg.
- `whisper-small/`: Whisper-small đa ngôn ngữ, trọng số FP16, runtime CPU INT8, license MIT và revision cố định.

Bộ cài kiểm tra đầy đủ tài nguyên và khả năng của helper trước khi đóng gói. Desktop cố định Whisper-small, hỗ trợ chọn tiếng Việt/tiếng Anh. Các thư mục sinh ra được Git bỏ qua; model đi kèm bộ cài đầy đủ.

[Hướng dẫn build](../../../../docs/desktop-build.md) · [Chạy desktop](../../../../readme-desktop.md)
