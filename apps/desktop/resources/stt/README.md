# Tài nguyên STT offline bắt buộc

[README / danh mục tài liệu](../../../../README.md#hướng-dẫn-theo-nhu-cầu)

Chạy `python scripts/build_desktop_stt.py` từ gốc repository trên đúng OS/architecture đích trước khi đóng gói. Script tạo helper native trong `oral-stt/` và model PhoWhisper-small INT8 theo revision cố định trong `model/`, kèm thông tin bản quyền. Hai thư mục sinh ra được Git bỏ qua; build bộ cài sẽ dừng nếu thiếu helper hoặc model.

Đây là model nhận dạng giọng nói, luôn đi kèm bộ cài đầy đủ. **Qwen3 sửa chính tả là model tùy chọn riêng**, không đặt trong thư mục này và không cần tải để thi hoặc build bộ cài.

Xem [build desktop](../../../../docs/desktop-build.md) và [tải hoặc bỏ qua model sửa chính tả](../../../../docs/transcript-correction.md).
