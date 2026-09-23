# Kiểm tra transcript sau STT

[README](../README.md#hướng-dẫn-theo-nhu-cầu) · [Hướng dẫn làm bài](user-guide.md#học-viên-làm-bài-trên-desktop)

Chức năng sửa chính tả bằng LLM đã được gỡ. Desktop không còn tải Qwen3, chạy node-llama-cpp hoặc cung cấp IPC sửa chính tả.

## Kiểm tra trước khi nộp

1. Bấm **Kết thúc trả lời** và chờ STT hoàn tất.
2. Nghe lại bản ghi, đối chiếu ô **Transcript**, đặc biệt tên riêng, số liệu và thuật ngữ tiếng Anh.
3. Nếu muốn nhận dạng lại, chọn **Bản ghi dùng cho STT → Bản gốc / Bản giảm nhiễu RNNoise**, rồi bấm **Thử STT lại**. Nút nhận dạng lại dùng bản audio đã chọn; upload minh chứng vẫn giữ bản gốc.
4. Sửa lỗi hoặc dấu câu trực tiếp trong ô **Transcript**. Bấm **Nộp câu trả lời & tiếp tục** khi đã kiểm tra xong.

Nhận dạng lại thành công sẽ thay nội dung transcript đang sửa; hãy thực hiện trước khi chỉnh tay. Nếu STT lỗi, transcript hiện tại được giữ lại. Bản giảm nhiễu chỉ chọn được khi lần ghi có bản lọc hợp lệ.

Khi transcript thay đổi so với kết quả STT gần nhất, hệ thống đánh dấu để giảng viên đối chiếu với bản ghi. App không tự bổ sung đáp án vào nội dung đã nói.

## Câu có cả tiếng Việt và tiếng Anh

Gợi ý thuật ngữ tiếng Anh được sinh cùng câu hỏi và hiển thị cho giảng viên ở màn hình đề thi. Các gợi ý chưa tự động sửa transcript hoặc được truyền vào STT; không bảo đảm PhoWhisper nhận đúng từ xen tiếng Anh. Người dùng cần nghe lại và kiểm tra cách viết. Admin xem [hướng dẫn thuật ngữ](user-guide.md#3-xem-câu-hỏi-và-thuật-ngữ-tiếng-anh).

## Nếu vẫn thấy nút tải model sửa chính tả

Giao diện hoặc bộ desktop đang dùng là bản cũ. Cập nhật server, sau đó mở lại app; phần Electron/preload cần source hoặc bộ cài mới. File Qwen3 đã tải ở bản cũ không còn được sử dụng. Cách dọn file tùy chọn nằm trong [hướng dẫn desktop](../readme-desktop.md#kiểm-tra-transcript).
