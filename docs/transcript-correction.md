# Sửa chính tả local — tải hoặc bỏ qua model

[README / danh mục tài liệu](../README.md#hướng-dẫn-theo-nhu-cầu) · [Hướng dẫn desktop](../readme-desktop.md) · [Build bộ cài](desktop-build.md)

**Model sửa chính tả là tùy chọn.** Bạn có thể không tải và vẫn ghi âm, nhận dạng, xem transcript, nộp bài và nhận kết quả. Ứng dụng chỉ tải khi bạn bấm **Tải model sửa chính tả (1,28 GB)**.

## Phân biệt các model

| Thành phần | Dùng để làm gì? | Có phải tải thêm trên máy học viên? |
| --- | --- | --- |
| PhoWhisper-small INT8 | Nhận dạng giọng nói thành transcript | Không. Đã có trong bộ cài desktop đầy đủ; bắt buộc khi build bộ cài. |
| Qwen3 1.7B Q4_K_M | Đề xuất sửa chính tả transcript | Tùy chọn, khoảng 1,28 GB. Chỉ tải nếu muốn dùng gợi ý. |
| LLM chấm bài Ollama/Gemini | Chấm transcript theo rubric và kiến thức | Do máy chủ cấu hình; không phụ thuộc việc học viên tải Qwen3 sửa chính tả. |

## Không muốn tải model

1. Mở bài thi, cấp quyền camera/mic và hoàn tất hoặc bỏ qua kiểm tra tiếng ồn theo giao diện.
2. Bỏ qua mục **Sửa chính tả local (tùy chọn)**, bấm **Bắt đầu thi**.
3. Ghi câu trả lời, dừng ghi âm rồi chờ PhoWhisper nhận dạng.
4. Đọc lại transcript. Có thể chọn bản gốc/bản giảm nhiễu và bấm **Thử STT lại** nếu cần.
5. Nộp câu trả lời và nộp bài như bình thường. Nếu tự sửa hoặc nhập transcript, bản đó cần giảng viên xem lại.

Không cần tắt tính năng trong cấu hình admin, đặt biến môi trường hoặc cài Ollama trên máy học viên. Việc không tải model không tự làm transcript STT bị đánh dấu là nhập tay.

## Muốn tải và dùng gợi ý

1. Trong mục **Sửa chính tả local (tùy chọn)**, bấm **Tải model sửa chính tả (1,28 GB)**. Có thể tải trước khi bắt đầu thi hoặc khi đang xem transcript, trước lúc nộp.
2. Chờ thông báo model sẵn sàng. Lần tải đầu cần mạng và dung lượng trống cho model; các lần dùng tiếp theo trong cùng profile không cần tải lại.
3. Sau khi có transcript, bấm **Gợi ý sửa chính tả và dấu câu**. Model chạy trên CPU của máy học viên.
4. So sánh **Bản trước khi sửa** với **Bản đề xuất**. Bấm **Áp dụng bản đề xuất** nếu đồng ý, hoặc **Giữ bản hiện tại**. App không tự sửa transcript sau STT, kể cả khi model đã được tải.

Luôn kiểm tra lại thuật ngữ, số liệu và ý nghĩa. Áp dụng bản đề xuất làm transcript trở thành bản đã chỉnh sửa và cần giảng viên đối chiếu. Gợi ý hỗ trợ tối đa 12.000 ký tự mỗi lần.

## Hủy tải, tải lỗi hoặc muốn thi tiếp

- Đang tải/xử lý: bấm **Hủy xử lý local**, chờ thao tác kết thúc rồi tiếp tục. App tạm khóa thao tác thi liên quan trong khi tác vụ local đang chạy.
- Tải lỗi: có thể bỏ qua để thi tiếp hoặc bấm tải lại khi có mạng. File tải dở được dọn; tải lại bắt đầu từ đầu.
- Gợi ý lỗi: transcript hiện tại vẫn được giữ. Có thể nộp bản đó hoặc chỉnh thủ công, không bắt buộc chạy gợi ý lại.
- STT lỗi khi dừng ghi âm: tải Qwen3 không sửa lỗi nhận dạng. Xem [xử lý lỗi desktop](../readme-desktop.md#xử-lý-lỗi), đặc biệt lỗi mã hóa tiếng Việt trên bản Windows cũ.

## Lưu trữ và cập nhật

Model nằm trong `models/correction` của thư mục dữ liệu Electron. Launcher `./run-desktop.sh` mặc định dùng `.data/desktop-dev-profile/models/correction`; chạy `npm run desktop` hoặc dùng bộ cài có thể dùng profile khác, nên trạng thái đã tải có thể khác nhau. File được kiểm tra dung lượng và SHA-256 trước khi dùng.

Để gỡ model, đóng app và chỉ xóa thư mục `models/correction` của đúng profile. Có thể tải lại sau. Không xóa model PhoWhisper trong `resources/stt/model` nếu vẫn cần STT local.

Gợi ý chính tả chạy offline sau khi tải; ứng dụng vẫn cần server cho đăng nhập, lấy đề, nộp bài và nhận điểm. Đoạn văn không gửi đến dịch vụ ngoài để sửa chính tả; transcript đã chọn vẫn được gửi lên server khi nộp bài.

Thay đổi nhãn/hướng dẫn trong giao diện cần cập nhật web đang phục vụ desktop. Không cần build lại STT hoặc tải Qwen3 để nhận thay đổi giao diện. Xem [cập nhật và build desktop](../readme-desktop.md#build-bộ-cài-và-chạy-lại).
