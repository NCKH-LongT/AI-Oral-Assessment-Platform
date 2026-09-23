# Hướng dẫn sử dụng OralAI

[README / danh mục tài liệu](../README.md#hướng-dẫn-theo-nhu-cầu) · [Desktop](../readme-desktop.md) · [Cập nhật qua Jenkins](jenkins.md)

Hướng dẫn theo chức năng hiện có ngày 23/09/2026. Admin và giảng viên quản lý trên web; học viên dùng desktop để nhận dạng giọng nói bằng PhoWhisper trên máy.

## Chuẩn bị và đăng nhập

- Dùng địa chỉ web do người vận hành cung cấp. Khi chạy Docker mặc định trên máy cá nhân, địa chỉ là `http://localhost:3000`.
- Admin ban đầu đăng nhập bằng `BOOTSTRAP_ADMIN` và `BOOTSTRAP_PASSWORD` đã cấu hình cho server. Admin có thể tạo tài khoản ở **Người dùng** và phân vai trò phù hợp.
- Học viên dùng tài khoản được cấp hoặc đăng nhập Google nếu server đã bật chức năng này.
- Server phải hoạt động để đăng nhập, lấy đề, nộp bài và xem kết quả. STT local không đồng nghĩa làm bài hoàn toàn offline.

## Admin và giảng viên chuẩn bị bài thi

### 1. Tạo môn và chuẩn bị kiến thức

1. Vào **Môn học & đề thi → Tạo môn học**, nhập mã, tên và mô tả rồi lưu.
2. Mở môn vừa tạo, chọn **01 · Kiến thức → Giáo trình**. Tải PDF và chờ xử lý thành **Sẵn sàng** (`READY`). Kiểm tra mục lục; sửa tên chương và khoảng trang nếu cần.
3. Trong **Chuẩn đầu ra**, tạo các LO mô tả kiến thức/kỹ năng cần đánh giá.
4. Trong **Chủ đề**, tạo chủ đề, chọn ít nhất một LO và một chương/mục giáo trình. Có thể bổ sung mô tả và tài liệu liên quan.
5. Nếu cần, tải thêm tài liệu tại **Tài liệu bổ sung**. Dùng **Tra cứu kiến thức** để kiểm tra nội dung được truy xuất trước khi sinh đề.

Tài liệu phải ở trạng thái `READY` và dùng cấu hình embedding hiện tại để công bố đề. Nếu nút tạo bài thi chưa bật, kiểm tra môn còn hoạt động và đã có chủ đề/rubric.

### 2. Tạo rubric và bản nháp đề

1. Mở **02 · Rubric**, tạo rubric gồm tiêu chí, mô tả, điểm tối đa và trọng số; bấm **Lưu rubric**.
2. Mở **03 · Bài thi & giao bài → Tạo bài thi**.
3. Nhập tên, thời gian, chọn rubric và phân bổ câu hỏi theo chủ đề, độ khó, số lượng. Bấm **Lưu bản nháp**.
4. Kiểm tra lại bản nháp. Admin có thể đặt **Cấu hình số lần làm lại**: không cho làm lại, cho thêm N lần hoặc không giới hạn.
5. Bấm **Sinh câu hỏi & công bố**, chờ hoàn tất trước khi giao bài.

Chế độ `AI_PROVIDER=demo` chỉ thử quy trình, không chấm điểm thật và không sinh gợi ý thuật ngữ. Người vận hành cấu hình Gemini/Ollama trên server theo [README](../README.md#chọn-llm-qua-env).

### 3. Xem câu hỏi và thuật ngữ tiếng Anh

Sau khi công bố, ngay dưới đề xuất hiện **Câu hỏi & thuật ngữ tiếng Anh gợi ý**. Mỗi câu hiển thị nội dung câu hỏi và các cặp thuật ngữ/nghĩa tiếng Việt, ví dụ `unit test: kiểm thử đơn vị`.

- AI gợi ý tối đa 20 thuật ngữ mỗi câu; giảng viên cần kiểm tra cách viết và nghĩa.
- Gợi ý được lưu cùng phiên bản đề và hiển thị trong trang quản lý. Học viên không nhận danh sách này qua màn hình câu hỏi.
- Đề cũ, đề demo hoặc câu không có thuật ngữ phù hợp có thể hiển thị **Chưa có gợi ý thuật ngữ cho câu hỏi này**.
- Hiện chưa có thao tác sửa trực tiếp danh sách thuật ngữ. Để sinh lại câu hỏi/gợi ý, chọn **Sao chép thành bản nháp**, điều chỉnh bản nháp và công bố lại; bản đề mới có thể có câu hỏi khác.
- Danh sách này chưa tự truyền vào PhoWhisper và chưa tự sửa transcript. Nhận dạng câu Việt xen tiếng Anh vẫn cần người dùng nghe lại, kiểm tra tên riêng và thuật ngữ.

Đề đã công bố giữ nguyên nội dung để đối chiếu kết quả. Nếu muốn kiểm tra đề trước khi học viên thấy, thực hiện trước khi thêm học viên vào môn; thành viên môn sẽ thấy các đề được công bố sau đó.

### 4. Giao bài

| Cách giao | Thao tác | Phạm vi |
| --- | --- | --- |
| Giao cả môn, dành cho admin | **04 · Học viên → chọn tài khoản → Thêm vào môn học** | Học viên thấy các đề đã công bố và đề công bố sau này trong môn |
| Giao riêng một đề | Mở đề đã công bố → **Giao riêng đề này cho học viên** → chọn người → **Giao bài cho sinh viên đã chọn** | Chỉ giao đề đã chọn |

Học viên bấm **Làm mới bài thi** nếu danh sách chưa cập nhật. **Bỏ khỏi môn** không xóa lịch sử thi hoặc thu hồi đề đã giao riêng.

## Học viên làm bài trên desktop

1. Mở OralAI, chọn máy chủ tại **OralAI → Cấu hình máy chủ…** rồi đăng nhập.
2. Chọn bài thi, bấm **Mở bài thi → Cho phép camera & mic**. Chọn đúng microphone và camera.
3. Để gain 0 dB, bấm **Kiểm tra độ ồn**: im lặng 3 giây, nói thử 7 giây. Phát lại bản gốc/bản lọc và chỉnh gain nếu cần. Hướng dẫn và chỉ số mức đỉnh được bố trí thành hai hàng cố định.
4. Chọn có dùng RNNoise cho STT hay không, bấm **Bắt đầu thi**. Mỗi câu bấm **Bắt đầu trả lời**, nói xong bấm **Kết thúc trả lời**.
5. Chờ PhoWhisper chuyển audio thành transcript. App hiện nhận dạng sau khi dừng ghi, chưa hiện chữ trực tiếp trong lúc nói.
6. Nghe lại, sửa transcript bằng tay nếu cần. Có thể chọn **Bản ghi dùng cho STT → Bản gốc / Bản giảm nhiễu RNNoise → Thử STT lại**; nhận dạng lại thành công sẽ thay transcript đang sửa.
7. Bấm **Nộp câu trả lời & tiếp tục**. Khi đủ câu và upload hoàn tất, bấm **Nộp bài thi** rồi chờ kết quả.

Chức năng sửa chính tả bằng LLM đã được gỡ; không cần tải Qwen3. Transcript sửa tay được đánh dấu để giảng viên đối chiếu bản ghi. Xem [kiểm tra transcript](transcript-correction.md) và [hướng dẫn mic](microphone-desktop.md).

## Xem kết quả và làm lại

- Admin/giảng viên mở **Kết quả & xem lại**, chọn lần thi để xem transcript, audio/video, đánh giá và tài liệu dẫn chứng.
- **Chưa có độ tin cậy AI** có thể xuất hiện khi chưa chấm, chấm lỗi hoặc dùng demo. Confidence do AI tự báo không phải bảo đảm độ chính xác.
- Admin dùng **Quản lý lượt thi → Cấp thêm lượt** khi cần cho một học viên thi lại. Học viên làm mới danh sách rồi chọn **Làm lại bài thi** nếu còn lượt; **Xem lần N** mở kết quả cũ.
- Nhận dạng lại audio và chấm lại transcript là hai thao tác riêng, đều có lịch sử. Xem [lượt thi](architecture/exam-retakes.md) và [chấm lại](architecture/grading-confidence.md).

## Lưu trữ hoặc xóa môn học

**Lưu trữ môn học** phù hợp khi muốn ngừng tạo bài mới và giữ dữ liệu lịch sử. Trong môn, vào **Cài đặt → Lưu trữ môn học**; dùng **Khôi phục môn học** để mở lại.

Để xóa toàn bộ môn học bằng tài khoản admin:

1. Vào **Môn học & đề thi → chọn môn → Cài đặt → Xóa môn học**.
2. Đọc tên môn và phạm vi dữ liệu trong hộp thoại **Xóa toàn bộ môn học**.
3. Nhập đúng mã môn đang hiển thị, rồi bấm **Xóa vĩnh viễn môn học và dữ liệu**.

Thao tác không hoàn tác được: xóa tài liệu, chủ đề, LO, rubric, đề thi, danh sách thành viên môn, lượt thi (kể cả bài đang làm), kết quả và bản ghi. Tài khoản người dùng và môn khác vẫn còn. Tệp được worker dọn sau khi dữ liệu được xóa; lỗi storage sẽ được thử lại. Nếu báo **Môn học đang được xử lý**, chờ tác vụ hoàn tất rồi thử lại.

Giảng viên chỉ xóa được môn trống mình phụ trách. Xóa riêng một lần thi tại **Kết quả & xem lại** khác với xóa toàn bộ môn học.

## Khi chưa thấy chức năng mới

Giao diện quản lý và API cần cùng được cập nhật. Với server Docker local, xem [cập nhật server](../README.md#build-cập-nhật-và-tài-liệu). Với server Jenkins, xem [hướng dẫn cập nhật](jenkins.md). Sau khi server cập nhật thành công, mở lại desktop. Thay đổi Electron/preload cần chạy source mới hoặc cài bộ desktop mới.
