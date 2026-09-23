# Thu thử, chỉnh gain, dấu câu và thoát desktop

[README / danh mục tài liệu](../README.md#hướng-dẫn-theo-nhu-cầu) · [Hướng dẫn desktop](../readme-desktop.md) · [Kiểm tra transcript](transcript-correction.md)

## Ghi thử và nghe lại trước khi thi

1. Mở một bài thi hoặc bài luyện tập, bấm **Cho phép camera & mic**. Chọn đúng **Microphone** và **Camera** trong phần **Chọn thiết bị**.
2. Để **Gain microphone** ở **0 dB** trước. Nói bình thường và quan sát thanh tín hiệu/mức đỉnh.
3. Bấm **Kiểm tra độ ồn** trong mục **Thu thử, nghe lại và kiểm tra độ ồn**. Giữ im lặng 3 giây đầu, sau đó nói thử 7 giây bằng giọng sẽ dùng khi thi.
4. Bấm **Phát bản gốc**. Có thể tua/dừng bằng bộ phát audio, rồi bật **Nghe bản đã lọc nhiễu RNNoise** và bấm **Phát bản đã lọc nhiễu** để so sánh.
5. Nếu cần, chỉnh gain và thu lại. Đổi gain sẽ xóa bản thử cũ và yêu cầu kiểm tra lại hoặc chọn bỏ qua trước khi bắt đầu.

Thu thử không tính vào thời gian thi, không nộp thành câu trả lời và không gửi lên server. Không phát mic trực tiếp ra loa; app chỉ phát bản thu sau khi thu xong. Khi ghi câu trả lời thật, có thể nghe lại audio trong màn hình kiểm tra transcript trước lúc nộp.

## Gain microphone hoạt động thế nào?

Gain là mức tăng/giảm âm lượng **đầu vào bản ghi**, khác với nút âm lượng loa khi nghe lại. Khoảng chỉnh là **−12 đến +18 dB**; **0 dB** giữ nguyên mức mic. Thiết lập áp dụng cho audio/video và audio dùng STT của các lần ghi mới. Bản gốc là bản chưa qua RNNoise, đã dùng gain bạn chọn lúc ghi; app không chỉnh lại những bản đã ghi hoặc đã nộp.

- Giọng nhỏ: thử tăng lên +3 dB, thu và nghe lại; tiếp tục tăng từng ít một nếu cần.
- Âm rè hoặc báo gần/vượt **−1 dBFS**: giảm gain hoặc đưa mic ra xa rồi thu lại.
- Giọng rõ, không rè: giữ thiết lập đó; âm lượng lớn hơn không luôn giúp STT tốt hơn.

Gain phần mềm cũng tăng tiếng nền. Nó không khôi phục âm đã vỡ tại mic hoặc sound card. Ưu tiên vị trí mic và nơi yên lặng. Mức đỉnh/dBFS là tham khảo tương đối, không phải phép đo độ ồn dBA và có thể bỏ sót xung rất ngắn; luôn nghe lại bản thu.

Không thể đổi gain trong lúc đang ghi, STT hoặc nộp bài. Phép đánh giá tiếng ồn môi trường vẫn đo tín hiệu trước gain, nên giảm gain không làm một phòng ồn thành kết quả yên lặng giả. Gain trở về 0 khi mở lại giao diện; nên thu thử mỗi phiên hoặc sau khi đổi thiết bị.

## Vì sao transcript thiếu dấu câu?

Desktop giữ kết quả PhoWhisper; model có thể trả đoạn văn thiếu dấu chấm/phẩy. Các đoạn nhận dạng được ghép bằng khoảng trắng, không tự coi mỗi đoạn hoặc khoảng nghỉ là một câu. Chất lượng dấu câu không được bảo đảm, kể cả khi nội dung từ đã đúng.

Có hai cách trước khi nộp:

- Tự thêm dấu câu trong ô **Transcript**.

Transcript có chỉnh sửa sẽ cần giảng viên đối chiếu khi nộp. Xem [kiểm tra transcript](transcript-correction.md).

## Đóng ứng dụng desktop

Dùng nút **Thoát ứng dụng** trên giao diện, menu **OralAI → Thoát ứng dụng**, nút **X** của cửa sổ hoặc **Alt+F4** trên Windows.

Nếu còn bản ghi/chưa nộp xong, app hiện hộp thoại:

- **Ở lại**: tiếp tục ghi/xử lý/nộp; đây là lựa chọn mặc định.
- **Rời trang / thoát**: đóng app và mất phần chưa nộp. Đây không phải thao tác nộp bài; thời gian thi trên server vẫn tiếp tục.

Khi thực sự đóng, app hủy tác vụ local đang chạy. Hủy hộp thoại đóng không hủy tác vụ. Nếu dùng bản cũ bấm X không có tác dụng, cập nhật Electron/bộ cài rồi mở lại; lỗi cũ do trang chặn `beforeunload` nhưng Electron chưa xử lý lựa chọn rời trang. Hộp thoại cũng áp dụng khi tải lại trang có dữ liệu chưa nộp.

## Nhận bản cập nhật

- Gain, thu thử, nhãn dấu câu và nút thoát trên giao diện: triển khai lại web đang phục vụ desktop, rồi mở lại app.
- Xử lý đóng cửa sổ, IPC thoát và prompt sửa dấu câu: chạy Electron source mới hoặc cài bộ desktop mới. Chỉ cập nhật server sẽ không sửa được việc nút X bị chặn trong desktop cũ.
