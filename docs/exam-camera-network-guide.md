# Camera, mạng yếu và phục hồi bài thi

## Trước khi thi

Cấp quyền thiết bị. Với lượt thi yêu cầu camera, đặt một khuôn mặt ở giữa ảnh, đủ sáng và không bị cắt. Phần trăm hiển thị là diện tích khung bao mặt so với toàn ảnh. Khi đạt liên tục khoảng 3 giây, nút bắt đầu mới bật. Camera đứng hình, nhiều mặt hoặc ảnh quá nhỏ chưa đạt. Model cần được tải từ web; lỗi model sẽ hiển thị thay vì coi là đạt.

Nhìn thẳng để hiệu chuẩn mắt khoảng 6 giây. Thông báo hướng mắt chỉ là ước lượng tương đối; kính, góc camera, ánh sáng và tư thế có thể ảnh hưởng. Không coi cảnh báo này là bằng chứng gian lận hoặc điểm số.

## Khi mạng chậm hoặc mất kết nối

Giữ trang/app mở và tiếp tục giữ thiết bị. Thời gian thi vẫn chạy. Audio được lưu từng đoạn trong trình duyệt; sau khi dừng ghi, bản hoàn chỉnh cũng được lưu trước nhận dạng và gửi. Upload có chia đoạn, checksum và thử lại; mỗi request media chờ tối đa 120 giây. Không có cam kết mọi thao tác thi đều hoạt động offline: mở đề, bắt đầu phiên/câu và nhiều bước xác nhận vẫn cần server.

Khi gửi lỗi, kiểm tra trạng thái trong Minh chứng và chọn Tải lại khi kết nối ổn định. Nếu phải tải lại trang, đăng nhập lại đúng tài khoản, chọn đúng chế độ local/online, mở lại đúng lượt thi rồi bấm Khôi phục bản ghi chờ tải trên máy.

- Bản đã có thông tin nộp: xuất hiện trong danh sách chờ tải; bấm Tải lại để gửi đúng payload/khóa ban đầu.
- Bản ghi chưa nộp của câu hiện tại: trở lại phần câu trả lời; thực hiện nhận dạng hoặc nhập transcript theo chế độ thi trước khi nộp.
- Bản sao chỉ xóa sau khi server xác nhận upload. Nếu trình duyệt chặn lưu/hết dung lượng, cảnh báo xuất hiện; vẫn có thể gửi bản trong RAM khi mạng hoạt động. Giữ trang mở trong trường hợp này.

Không xóa dữ liệu trình duyệt, dùng cửa sổ riêng tư hoặc đổi thiết bị khi còn bản ghi chờ tải. Phần âm thanh chưa kịp phát sinh/commit có thể mất khi app crash. Không đảm bảo phục hồi sau khi dữ liệu trình duyệt bị xóa hoặc thu hồi. Khi gặp lỗi phiên hết hạn/đã kết thúc, giữ dữ liệu và liên hệ khảo thí, không tự tạo câu trả lời thay thế.

## Tổ chức 30 người

Đã kiểm thử 30 client API local đồng thời với login, tạo phiên, audio mẫu nhỏ và nộp; tất cả đạt. Chưa phải đo tải server thực tế. Máy thí sinh tự xử lý camera, không gửi từng frame lên server để suy luận. Worker AI vẫn chấm tuần tự để tránh nạp 30 model đồng thời; thời gian nhận điểm phụ thuộc hàng đợi.

Trước buổi thi thật, chạy thử trên đúng server, PostgreSQL, storage và mạng trường với audio có dung lượng gần thực tế. Theo dõi lỗi HTTP, độ trễ p95, CPU/RAM và thời gian chờ hàng đợi. Hướng dẫn công cụ: tools/load-lab/README.md; bằng chứng kiểm thử: docs/architecture/exam-resilience-proctoring.md.
