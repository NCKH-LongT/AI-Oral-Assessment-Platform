# Microphone, dấu câu và thoát desktop

[README / danh mục tài liệu](../README.md#hướng-dẫn-theo-nhu-cầu) · [Hướng dẫn desktop](../readme-desktop.md) · [Kiểm tra transcript](transcript-correction.md)

## Kết nối thiết bị và kiểm tra transcript

**Cập nhật 09/10/2026:** Desktop đã bỏ thu thử/kiểm tra độ ồn trước thi, gain microphone và RNNoise. Trình duyệt web vẫn giữ những chức năng này; xem [kiến trúc âm thanh trên web](architecture/crud-noise-check.md#kiểm-tra-mic-trên-trình-duyệt-web).

1. Mở một bài thi hoặc bài luyện tập, bấm **Cho phép camera & mic**. Chọn đúng **Microphone** và **Camera** trong phần **Chọn thiết bị**.
2. Chọn ngôn ngữ và model tại **Nhận dạng giọng nói trên desktop**.
3. Khi thiết bị đã kết nối, bấm **Bắt đầu thi**. Desktop không yêu cầu thu thử hoặc chọn bỏ qua.
4. Ghi câu trả lời rồi bấm **Kết thúc trả lời**. Kiểm tra transcript trước khi nộp.

Nếu âm nhỏ hoặc rè, kiểm tra vị trí microphone và mức đầu vào trong cài đặt âm thanh của hệ điều hành. Desktop vẫn có thanh tín hiệu microphone và mức đỉnh dBFS để quan sát đầu vào, kèm cảnh báo khi gần/vượt −1 dBFS. Những chỉ số này không thay đổi âm thanh; desktop không có thanh gain và không tự khuếch đại qua gain phần mềm của ứng dụng. Không phát mic trực tiếp ra loa.

## Bản ghi dùng cho STT

Desktop luôn dùng **audio gốc** cho lần nhận dạng đầu và **Thử STT lại**, không tạo bản RNNoise. Có thể đổi ngôn ngữ/model trước khi thử lại; lựa chọn bị khóa khi đang ghi, nhận dạng hoặc nộp. Nhận dạng lại thành công thay transcript đang sửa, còn lỗi STT giữ transcript hiện tại.

Audio/video minh chứng vẫn được ghi và upload theo từng câu trả lời. Màn hình trả lời hiện không có bộ phát lại audio; giảng viên có thể mở minh chứng đã upload khi review bài. Helper STT chỉ đổi định dạng về mono 16 kHz trước khi nhận dạng; không thêm bước lọc nhiễu. Bản đã ghi hoặc nộp không bị chỉnh lại.

## Vì sao transcript thiếu dấu câu?

Desktop giữ kết quả của PhoWhisper-small hoặc Whisper-small đã chọn; model có thể trả đoạn văn thiếu dấu chấm/phẩy. Các đoạn nhận dạng được ghép bằng khoảng trắng, không tự coi mỗi đoạn hoặc khoảng nghỉ là một câu. Chất lượng dấu câu không được bảo đảm, kể cả khi nội dung từ đã đúng.

Trước khi nộp, có thể tự thêm dấu câu trong ô **Transcript**.

Transcript có chỉnh sửa sẽ cần giảng viên đối chiếu khi nộp. Xem [kiểm tra transcript](transcript-correction.md).

## Đóng ứng dụng desktop

Dùng nút **Thoát ứng dụng** trên giao diện, menu **OralAI → Thoát ứng dụng**, nút **X** của cửa sổ hoặc **Alt+F4** trên Windows.

Nếu còn bản ghi/chưa nộp xong, app hiện hộp thoại:

- **Ở lại**: tiếp tục ghi/xử lý/nộp; đây là lựa chọn mặc định.
- **Rời trang / thoát**: đóng app và mất phần chưa nộp. Đây không phải thao tác nộp bài; thời gian thi trên server vẫn tiếp tục.

Khi thực sự đóng, app hủy tác vụ local đang chạy. Hủy hộp thoại đóng không hủy tác vụ. Nếu dùng bản cũ bấm X không có tác dụng, cập nhật Electron/bộ cài rồi mở lại; lỗi cũ do trang chặn `beforeunload` nhưng Electron chưa xử lý lựa chọn rời trang. Hộp thoại cũng áp dụng khi tải lại trang có dữ liệu chưa nộp.

## Nhận bản cập nhật

- Bỏ gain/thu thử/RNNoise trên desktop, nhãn dấu câu và nút thoát trên giao diện: triển khai lại web đang phục vụ desktop, rồi mở lại app. Riêng thay đổi luồng audio này không cần build lại helper hoặc model STT.
- Xử lý đóng cửa sổ và IPC thoát: chạy Electron source mới hoặc cài bộ desktop mới. Chỉ cập nhật server sẽ không sửa được việc nút X bị chặn trong desktop cũ.
