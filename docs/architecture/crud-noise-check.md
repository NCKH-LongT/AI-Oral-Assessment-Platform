# CRUD và kiểm tra tiếng ồn trước thi — 13/09/2026

## Quản lý môn học, rubric, đề thi

| Đối tượng | Tạo/đọc/sửa | Xóa và dữ liệu đang dùng |
| --- | --- | --- |
| Môn học | Danh sách, workspace, form Cài đặt; ADMIN hoặc giảng viên phụ trách được sửa | `DELETE /admin/courses/{id}` xóa thật khi không có LO, chủ đề, tài liệu, rubric hoặc đề thi; còn dữ liệu trả 409 `COURSE_IN_USE` |
| Rubric | Danh sách tiêu chí, tên, mô tả, điểm/trọng số; sửa tăng version | `DELETE /admin/rubrics/{id}` trả 409 `RUBRIC_IN_USE` khi còn đề thi tham chiếu; sửa rubric không đổi snapshot đề đã công bố |
| Đề thi | Danh sách hiển thị rubric/blueprint, tạo và sửa bản nháp; không chuyển môn khi sửa | Chỉ xóa bản nháp; đề đã công bố không sửa/xóa để bảo toàn lịch sử |

`POST /admin/courses/{id}/archive` và `/restore` chuyển trạng thái môn; lưu trữ chặn tạo đề và sao chép đề. **Thay đổi hành vi API:** trước đây DELETE môn học chỉ lưu trữ; client tích hợp muốn giữ hành vi đó phải chuyển sang POST `/archive`.

`POST /admin/exams/{id}/copy` tạo bản nháp mới có tên thêm “(bản sao)”, giữ rubric ID, thời gian và blueprint, không có snapshot, assignment, session hoặc kết quả. Bản sao dùng rubric và nguồn kiến thức hiện tại khi công bố lại, không phải bản chụp kiến thức của đề gốc. Giảng viên khác môn và STUDENT/REVIEWER không được thực hiện thao tác ghi. Giao diện có hủy sửa, reset form sau lưu, xóa có xác nhận; lỗi dependency hiện tại vị trí thao tác.

Không thay đổi bảng/cột hay chạy migration mới. Foreign key vẫn là lớp bảo vệ cuối khi có thao tác đồng thời.

## Chọn microphone và camera

Bước kết nối có hai danh sách thiết bị từ `enumerateDevices`, cập nhật qua `devicechange`. Cấp quyền để xem tên đầy đủ. Chọn thiết bị gọi `getUserMedia` với `deviceId.exact`, dừng stream/RNNoise cũ và hủy phép đo mic cũ. Luồng ghi minh chứng, RNNoise và phép kiểm tra 10 giây dùng microphone đã chọn. Không tự fallback nếu thiết bị đã chọn bị rút; báo lỗi và cho chọn lại. Khóa lựa chọn khi đang kết nối, bắt đầu ghi, ghi, STT hoặc nộp câu trả lời.

## Kiểm tra mic — cập nhật 17/09/2026

`lib/noise-check.ts` ghi thử khoảng **10 giây**: giữ im lặng 3 giây đầu để đánh giá nền, nói thử 7 giây sau để nghe giọng. Bỏ 500 ms khởi động trước lúc ghi. MediaRecorder thu đồng thời bản gốc và bản RNNoise, chỉ giữ Blob trong bộ nhớ máy học viên, không upload.

Sau khi ghi, dùng audio player và checkbox **Nghe bản đã lọc nhiễu RNNoise** để so sánh cùng một lần thu. Khi RNNoise không tải được, vẫn nghe bản gốc và thấy thông báo lỗi. Kiểm tra lại giải phóng URL/audio cũ; bỏ qua, lỗi và unmount đều dừng track, recorder và AudioContext.

Đánh giá dùng RMS/dBFS từ microphone yêu cầu tắt xử lý tự động. Ít nhất 20% cửa sổ trong 3 giây đầu ≥ −40 dBFS thì báo quá ồn. Nếu toàn bộ 10 giây không có tín hiệu ≥ −90 dBFS thì yêu cầu kiểm tra mic. Âm nền yên lặng nhưng sau đó có tiếng nói vẫn là mic hoạt động. Đây là ngưỡng tương đối, không phải dBA/SPL, không phân loại nguồn ồn hoặc chống gian lận.

Sau cấp quyền thiết bị, nút bắt đầu thi chờ kết quả đạt hoặc người dùng bỏ qua. Có thể kiểm tra lại, bỏ qua khi đang thu và kết nối lại thiết bị. Bản thử không tính vào thời gian thi. Hệ thống không ghi quyết định bỏ qua lên server.

## Lọc nhiễu câu trả lời

`lib/noise-filter.ts` dùng `@sapphi-red/web-noise-suppressor` (RNNoise WASM/AudioWorklet) ở 48 kHz. Checkbox trước thi bật/tắt lọc nhiễu cho nhánh audio đưa vào STT. Không nối microphone ra loa để tránh hú; nghe thử bằng bản thu phát lại. Audio/video minh chứng luôn lấy từ nhánh gốc.

Asset được copy từ dependency npm khi `predev`/`prebuild`, phục vụ tại `/audio` cùng origin, có trong Docker standalone. Không tải WASM từ CDN. Nếu bộ lọc lỗi, người dùng cần tắt lọc hoặc kết nối lại trước lần ghi tiếp theo. PhoWhisper chỉ đổi định dạng sang mono 16 kHz, không lọc FFmpeg lần hai. Client web mới gửi `preprocessing=off` đến `/stt` để tránh lọc lại; client cũ không gửi trường này vẫn theo policy lưu trên server.

RNNoise phù hợp thử với tiếng quạt/âm nền, không bảo đảm loại được người nói chồng. Chưa có benchmark WER/CER tiếng Việt hoặc đo thiết bị lớp học thực tế; không khẳng định chất lượng STT cải thiện trên mọi mẫu. Không tích hợp Spleeter vì đó là mô hình tách nhạc, không cần cho luồng hiện tại.
