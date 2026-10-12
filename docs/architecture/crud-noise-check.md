# CRUD và luồng âm thanh desktop/web

[README / danh mục tài liệu](../../README.md#hướng-dẫn-theo-nhu-cầu)

Electron và trình duyệt dùng chung giao diện Next.js. Bridge `oralDesktop` xác định luồng desktop: ghi audio/video gốc và nhận dạng trên thiết bị. Trình duyệt có các công cụ kiểm tra microphone, gain và lọc nhiễu RNNoise.

## Quản lý môn học, rubric, đề thi

| Đối tượng | Tạo/đọc/sửa | Xóa và dữ liệu đang dùng |
| --- | --- | --- |
| Môn học | Danh sách, workspace, form Cài đặt; ADMIN hoặc giảng viên phụ trách được sửa | `DELETE /admin/courses/{id}` không có body chỉ xóa môn trống; còn dữ liệu trả 409 `COURSE_IN_USE`. ADMIN gửi `{ "confirm_code": "MÃ_MÔN" }` để xóa toàn bộ cây dữ liệu; giảng viên không có quyền xóa cả cây |
| Rubric | Danh sách tiêu chí, tên, mô tả, điểm/trọng số; sửa tăng version | `DELETE /admin/rubrics/{id}` trả 409 `RUBRIC_IN_USE` khi còn đề thi tham chiếu; sửa rubric không đổi snapshot đề đã công bố |
| Đề thi | Danh sách hiển thị rubric/blueprint, tạo và sửa bản nháp; không chuyển môn khi sửa | Xóa riêng đề chỉ áp dụng cho bản nháp; đề đã công bố giữ nguyên, trừ khi ADMIN xác nhận xóa toàn bộ môn học |

`POST /admin/courses/{id}/archive` và `/restore` chuyển trạng thái môn; lưu trữ chặn tạo đề và sao chép đề.

`POST /admin/exams/{id}/copy` tạo bản nháp mới có tên thêm “(bản sao)”, giữ rubric ID, thời gian và blueprint, không có snapshot, assignment, session hoặc kết quả. Bản sao dùng rubric và nguồn kiến thức hiện tại khi công bố lại, không phải bản chụp kiến thức của đề gốc. Giảng viên khác môn và STUDENT không được thực hiện thao tác ghi. Giao diện có hủy sửa, reset form sau lưu, xóa có xác nhận; lỗi dependency hiện tại vị trí thao tác.

Foreign key bảo vệ tính toàn vẹn dữ liệu khi có thao tác đồng thời.

## Chọn microphone và camera

Bước kết nối có hai danh sách thiết bị từ `enumerateDevices`, cập nhật qua `devicechange`. Cấp quyền để xem tên đầy đủ. Chọn thiết bị gọi `getUserMedia` với `deviceId.exact` và dừng stream cũ. Trên web, thao tác này còn dừng RNNoise và hủy phép đo mic cũ; các nhánh ghi minh chứng, RNNoise và phép kiểm tra 10 giây đều dùng microphone đã chọn. Không tự fallback nếu thiết bị đã chọn bị rút; báo lỗi và cho chọn lại. Khóa lựa chọn khi đang kết nối, bắt đầu ghi, ghi, STT hoặc nộp câu trả lời.

Electron kiểm tra quyền media theo `new URL(value).origin`. Chỉ renderer của cửa sổ chính ở origin đang chọn được cấp quyền.

## Audio trên desktop

Khi có bridge `oralDesktop`, kết nối thiết bị giữ trực tiếp stream microphone/camera để preview và ghi câu trả lời. Giao diện hiển thị thanh tín hiệu microphone và mức đỉnh dBFS để quan sát đầu vào. Nhánh đo tín hiệu giữ nguyên audio ghi/STT. **Bắt đầu thi** yêu cầu thiết bị đã kết nối và các điều kiện phiên thi hợp lệ.

Audio gốc dùng cho cả STT lần đầu và **Thử STT lại**, bằng Whisper-small với ngôn ngữ tiếng Việt/tiếng Anh. Helper chuyển định dạng sang mono 16 kHz trước khi nhận dạng. Audio/video gốc được upload làm minh chứng; giảng viên mở bản đã upload để review. Desktop hiển thị trạng thái nhận dạng; transcript tự động gửi lên server để chấm và cho giảng viên review.

## Kiểm tra mic trên trình duyệt web

`lib/noise-check.ts` ghi thử khoảng **10 giây**: giữ im lặng 3 giây đầu để đánh giá nền, nói thử 7 giây sau để nghe giọng. Bỏ 500 ms khởi động trước lúc ghi. MediaRecorder thu đồng thời bản gốc và bản RNNoise, chỉ giữ Blob trong bộ nhớ máy học viên, không upload.

Sau khi ghi, dùng audio player và checkbox **Nghe bản đã lọc nhiễu RNNoise** để so sánh cùng một lần thu. Khi RNNoise không tải được, vẫn nghe bản gốc và thấy thông báo lỗi. Kiểm tra lại giải phóng URL/audio cũ; bỏ qua, lỗi và unmount đều dừng track, recorder và AudioContext.

Đánh giá dùng RMS/dBFS từ microphone yêu cầu tắt xử lý tự động. Ít nhất 20% cửa sổ trong 3 giây đầu ≥ −40 dBFS thì báo quá ồn. Nếu toàn bộ 10 giây không có tín hiệu ≥ −90 dBFS thì yêu cầu kiểm tra mic. Âm nền yên lặng nhưng sau đó có tiếng nói vẫn là mic hoạt động. Đây là ngưỡng tương đối, không phải dBA/SPL, không phân loại nguồn ồn hoặc chống gian lận.

Sau cấp quyền thiết bị, nút bắt đầu thi chờ kết quả đạt hoặc người dùng bỏ qua. Có thể kiểm tra lại, bỏ qua khi đang thu và kết nối lại thiết bị. Bản thử không tính vào thời gian thi. Hệ thống không ghi quyết định bỏ qua lên server.

## Gain và lọc nhiễu câu trả lời trên trình duyệt web

`lib/microphone-gain.ts` dùng Web Audio GainNode, −12 đến +18 dB, mặc định 0. Luồng mic → gain → audio/video gốc; nhánh gain → RNNoise tạo audio STT đã lọc. Trên web, bản gốc là bản chưa RNNoise, đã áp dụng gain chọn lúc ghi. Không chỉnh lại minh chứng đã nộp. Bản thu thử dùng cùng gain; đánh giá nền dùng tín hiệu trước gain để không thay kết luận tiếng ồn theo thanh gain. Theo dõi mức đỉnh và nhắc giảm gain khi gần/vượt −1 dBFS. Đổi gain hủy phép thử và giải phóng bản nghe thử trước đó; khóa khi ghi/xử lý/nộp. Các điều khiển và xử lý gain này áp dụng trên trình duyệt web.

`lib/noise-filter.ts` dùng `@sapphi-red/web-noise-suppressor` (RNNoise WASM/AudioWorklet) ở 48 kHz. Khi bộ lọc hoạt động, câu trả lời luôn ghi đồng thời audio gốc, audio RNNoise và video gốc. Checkbox trước thi mặc định tắt, chọn bản dùng cho lần STT đầu; dropdown sau ghi cho phép nhận dạng lại từ một trong hai Blob. Lỗi RNNoise giữa lúc ghi làm bản lọc không hợp lệ và khóa lựa chọn đó. Không nối microphone ra loa để tránh hú; nghe thử bằng bản thu phát lại. Audio/video minh chứng luôn lấy từ nhánh gốc.

Asset được copy từ dependency npm khi `predev`/`prebuild` hoặc khi chạy launcher local, phục vụ tại `/audio` cùng origin, có trong Docker standalone. Nếu bộ lọc lỗi, người dùng cần tắt lọc hoặc kết nối lại trước lần ghi tiếp theo. Client web gửi `preprocessing=off` đến `/stt` để giữ nguyên bản ghi đã chọn; request không có trường này dùng policy lưu trên server.

RNNoise xử lý tiếng quạt và âm nền; hiệu quả phụ thuộc bản ghi và thiết bị. Bộ lọc không bảo đảm loại được người nói chồng. Người dùng so sánh bản gốc và bản lọc khi kiểm tra microphone.

## Xóa toàn bộ môn học và gợi ý thuật ngữ

Admin xác nhận bằng mã môn trong Cài đặt. Giao dịch xóa giữ khóa các bản ghi cha/con, xóa liên kết và dữ liệu theo thứ tự khóa ngoại, đồng thời ghi audit `COURSE_DELETED`. Nếu bản ghi đang được xử lý, API trả 409 `COURSE_BUSY` để thử lại. Tài liệu và upload được đưa vào `media_cleanup` trong cùng giao dịch; worker xóa object/thư mục upload sau commit và tự thử lại khi storage lỗi. Không xóa tài khoản người dùng hoặc dữ liệu môn khác.

`QuestionOutput.english_terms` chứa tối đa 20 cặp `term`/`meaning`, chuẩn hóa khoảng trắng và bỏ trùng không phân biệt hoa thường. AI sinh gợi ý trong cùng yêu cầu tạo câu hỏi, snapshot giữ nguyên theo phiên bản đề (`topic-los-english-terms-v3`). Workspace giảng viên trả câu hỏi và thuật ngữ để review; API sinh viên không trả thuật ngữ. STT sử dụng [hotword cấu hình riêng theo môn](examination-workflow.md#hotword-stt).
