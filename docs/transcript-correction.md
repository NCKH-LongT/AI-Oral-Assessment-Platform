# Transcript và đối chiếu bản ghi

[README](../README.md#hướng-dẫn-theo-nhu-cầu) · [Làm bài trên desktop](user-guide.md#học-viên-làm-bài-trên-desktop)

## Nhận dạng trên desktop

Sau **Kết thúc trả lời**, Whisper-small nhận dạng audio gốc theo ngôn ngữ đã chọn. Desktop hiển thị trạng thái xử lý và cho nộp khi nhận dạng thành công. Transcript và độ tin cậy được gửi tự động lên server; nội dung nhận dạng dành cho giảng viên xem lại.

Sinh viên có thể bấm **Thử STT lại** hoặc **Ghi lại**. Đổi ngôn ngữ rồi nhận dạng lại áp dụng cho cùng bản ghi. Nhận dạng lại thành công thay kết quả trước; lỗi giữ kết quả thành công gần nhất. Audio/video minh chứng giữ nguyên khi thử STT lại.

## Giảng viên đối chiếu

Mở **Kết quả & xem lại → Xem bài**, đọc transcript và nghe audio/video tương ứng. Kiểm tra đặc biệt tên riêng, thuật ngữ, số liệu và từ phủ định vì chúng có thể ảnh hưởng điểm nội dung. Dấu câu và độ tin cậy STT không bảo đảm transcript đúng.

Admin có thể yêu cầu **Nhận dạng lại & chấm lại** bằng Gemini hoặc Google, hoặc **Chấm lại transcript đã nộp** với phiên bản tương thích. Hệ thống giữ bản nộp, kết quả trước/sau và lý do review. Xem [độ tin cậy và chấm lại](architecture/grading-confidence.md).

Hotword được cấu hình theo môn và lưu trong snapshot đề. Thuật ngữ AI gợi ý khi sinh câu hỏi dành cho giảng viên review; xem [hướng dẫn thuật ngữ](user-guide.md#3-xem-câu-hỏi-và-thuật-ngữ-tiếng-anh).

## Bài luyện tập trên web

Nhân sự có quyền truy cập web có thể kiểm tra và sửa ô **Transcript** trong bài luyện tập. Bản sửa khác kết quả STT được gửi với confidence 0 để yêu cầu đối chiếu. Khi thử STT lại, chọn bản gốc hoặc bản RNNoise hợp lệ của lần ghi; kết quả mới thay nội dung đang sửa. [Luồng audio web](architecture/crud-noise-check.md#kiểm-tra-mic-trên-trình-duyệt-web).
