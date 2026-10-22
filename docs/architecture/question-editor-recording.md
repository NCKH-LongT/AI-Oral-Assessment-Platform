# Editor câu hỏi và minh chứng bài thi — 22/10/2026

## Soạn câu hỏi có ảnh

Trong **Ngân hàng đề thi → chọn môn**, hoặc **Điều phối kỳ thi → Đề thi &
duyệt**, câu hỏi mặc định hiển thị nội dung để đọc. Bấm **Sửa câu N** để mở
editor riêng cho câu đó. Có định dạng đậm/nghiêng/gạch chân, tiêu đề, danh
sách, đánh số, hoàn tác và **Chèn ảnh** từ máy. Chọn ảnh rồi nhấn Backspace
hoặc Delete trong editor để xóa ảnh.

**Xong câu N** đóng editor để xem trước, **Hủy sửa câu N** khôi phục nội dung
trước khi mở câu. Bấm **Lưu nội dung đã review** để lưu các thay đổi lên
server; đóng editor không đồng nghĩa đã lưu. Chờ xử lý ảnh xong trước khi
lưu. Giới hạn: 10–4000 ký tự, tối đa 4 ảnh/câu; nhận PNG/JPEG/WebP không quá
10 MB/ảnh, thu nhỏ cạnh dài tối đa 1280 px và nén JPEG tối đa 300 KB/ảnh.

ADMIN, EXAM_OFFICER và TEACHER được sửa đề ở trạng thái GENERATED trong phạm
vi truy cập của mình. Khảo thí có quyền sửa câu hỏi/rubric; bước **Duyệt đề &
gửi khảo thí** vẫn dành cho giảng viên/admin. Đề đã duyệt hoặc công bố dùng
**Sao chép thành bản nháp** để chỉnh sửa: bản sao giữ chữ, định dạng, ảnh,
rubric và thời gian từng câu, bỏ dấu duyệt và phải qua duyệt lại. Không đổi
câu hỏi của sinh viên đã/đang thi. API sao chép cũ không truyền
`preserve_content=true` vẫn tạo DRAFT theo hành vi trước đây.

Ảnh và định dạng hiển thị trong ngân hàng, bài thi desktop và chi tiết bài
làm. Nội dung cũ chỉ có text vẫn hiển thị bình thường. Với câu hỏi dựa trên
ảnh, giảng viên cần mô tả các ý mong đợi trong **Ý chính mong đợi** và rubric;
luồng AI hiện chấm theo chữ, transcript và tài liệu, chưa phân tích ảnh.

## Dữ liệu và kiểm tra nội dung

- `DraftQuestion.rich_content` là tài liệu JSON; `text` được backend rút từ
  tài liệu để dùng tìm kiếm/chấm điểm. Không đưa base64 ảnh vào prompt LLM.
- Ảnh nhúng trong snapshot; không phụ thuộc URL ngoài và không có URL ảnh
  công khai riêng. Quyền đọc ảnh theo quyền đọc đề/câu hỏi của lượt thi.
- Backend kiểm tra loại node, cấu trúc, độ sâu, số lượng node, dấu định dạng,
  chữ và dung lượng ảnh. Không nhận HTML, script, SVG, iframe hoặc ảnh từ
  URL bên ngoài. Giao diện chỉ render các phần tử cho phép, không chèn HTML
  trực tiếp. Editor được tải khi người dùng mở sửa câu.
- API sửa đề vẫn kiểm tra nguồn tham chiếu thuộc chủ đề, phạm vi môn/lớp và
  trạng thái đề. Việc lưu ảnh không mở rộng quyền vào dữ liệu khác.
- Không cần migration mới: dùng JSON snapshot và question hiện có.

## Ghi và nộp bài trên desktop

Mỗi câu chỉ ghi và upload **AUDIO**. Camera vẫn hoạt động để hiển thị trên
giao diện khi quy định yêu cầu; khung lấy tỉ lệ từ kích thước video thật,
hiển thị toàn ảnh bằng `object-fit: contain`. Không tạo recorder hoặc upload
**VIDEO** camera cho từng câu.

Khi **Ghi toàn màn hình** bật, video **SCREEN** ghi cho cả lượt thi, bao gồm
khung camera đang hiển thị. Giữ cơ chế chia đoạn và thử lại khi lỗi mạng để
hạn chế mất dữ liệu; các đoạn không chia theo câu hỏi. Bản ghi màn hình
không thu âm; âm thanh nằm ở audio từng câu. Nếu admin tắt ghi màn hình,
không có video màn hình; bật camera riêng chỉ yêu cầu preview camera.

Backend chỉ hoàn tất lượt thi khi audio các câu đã nộp và minh chứng SCREEN
bắt buộc đã tải xong. Camera/mic mất kết nối vẫn chặn trả lời theo luồng kiểm
tra thiết bị. Media cũ, kể cả VIDEO camera, được giữ và xem lại như trước;
thay đổi này không xóa dữ liệu đã có. “Lượt thi gần đây → Xem bài” mở đúng
ID lượt thi và sinh viên của hàng được chọn.

Triển khai API và web cùng phiên bản; source desktop cần đóng/mở lại,
bộ cài cần build/cài lại để nhận CSS camera mới. Giao diện mới với API cũ
còn bắt VIDEO từng câu sẽ không nộp được. Jenkins không tự build bộ cài
Windows. Các kiểm thử và giới hạn được ghi ở [validation](../validation.md).
