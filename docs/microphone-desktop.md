# Microphone và thoát desktop

[README](../README.md#hướng-dẫn-theo-nhu-cầu) · [Hướng dẫn desktop](../readme-desktop.md)

## Kết nối thiết bị

1. Mở bài thi, bấm **Cho phép camera & mic**.
2. Chọn đúng **Microphone** và **Camera** trong phần **Chọn thiết bị**.
3. Chọn **Ngôn ngữ nói** trong **Nhận dạng giọng nói trên desktop**.
4. Kiểm tra camera, thanh tín hiệu và mức đỉnh dBFS. Khi đủ điều kiện thi, bấm **Bắt đầu thi** và cấp quyền ghi toàn màn hình.

Nếu âm nhỏ hoặc rè, điều chỉnh vị trí microphone và mức đầu vào trong cài đặt hệ điều hành. Cảnh báo gần/vượt −1 dBFS giúp nhận biết tín hiệu có thể quá lớn. Thanh đo không thay đổi âm thanh ghi. Khi rút thiết bị, app chặn ghi tiếp và cho chọn thiết bị khác hoặc kết nối lại.

## Ghi câu trả lời và nhận dạng

Bấm **Bắt đầu trả lời**, nói xong bấm **Kết thúc trả lời**. Whisper-small nhận dạng audio gốc sau khi helper đổi định dạng về mono 16 kHz. Chờ trạng thái sẵn sàng rồi nộp câu trả lời.

Khi có lỗi, dùng **Thử STT lại** hoặc **Ghi lại**. Có thể đổi ngôn ngữ trước khi thử lại; lựa chọn bị khóa trong lúc ghi, nhận dạng hoặc nộp. App giữ kết quả thành công gần nhất nếu lần nhận dạng lại bị lỗi.

Audio/video và transcript được gửi lên server. Giảng viên mở minh chứng trong **Kết quả & xem lại** để kiểm tra nội dung nhận dạng. [Transcript và review](transcript-correction.md).

## Đóng ứng dụng

Dùng **Thoát ứng dụng**, nút X hoặc phím đóng cửa sổ của hệ điều hành khi khả dụng. Khi đang thi, xem [chế độ thi và thoát khẩn cấp](../readme-desktop.md#truy-cập-và-ghi-màn-hình-bắt-buộc).

Nếu còn bản ghi hoặc dữ liệu chưa nộp, hộp thoại có **Ở lại** (mặc định) và **Rời trang / thoát**. Rời ứng dụng có thể mất phần chưa tải lên; thời gian thi trên server vẫn chạy. Để hoàn tất bài, chờ upload rồi bấm **Nộp bài thi** trước khi đóng.

Khi đóng thật, app hủy tác vụ local đang chạy và thử khôi phục cấu hình màn hình đã lưu. Thay đổi Electron/helper cần mở lại source mới hoặc cài bộ desktop mới; hướng dẫn tại [Build và cập nhật](../readme-desktop.md#build-bộ-cài-và-chạy-lại).
