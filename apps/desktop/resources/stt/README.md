# Tài nguyên STT offline bắt buộc

[README / danh mục tài liệu](../../../../README.md#hướng-dẫn-theo-nhu-cầu)

Chạy `python scripts/build_desktop_stt.py` từ gốc repository trên đúng OS/architecture đích trước khi đóng gói. Script tạo helper native trong `oral-stt/`, PhoWhisper-small INT8 trong `model/` và Whisper-small đa ngôn ngữ trong `whisper-small/`, kèm license và revision cố định. Whisper-small lưu trọng số FP16, chạy CPU INT8. Ba thư mục sinh ra được Git bỏ qua; build bộ cài sẽ dừng nếu thiếu helper/model hoặc helper cũ không hỗ trợ protocol chọn model/ngôn ngữ và hotword.

Hai model nhận dạng giọng nói đi kèm bộ cài đầy đủ. Không tải model trong lúc thi. Desktop chọn tiếng Việt/tiếng Anh và model ngay trong màn hình làm bài.

Xem [build desktop](../../../../docs/desktop-build.md).
