# Bộ môn, lớp học và ngân hàng đề thi

[README](../../README.md) · [Hướng dẫn sử dụng](../user-guide.md) · [Kiểm thử](../validation.md)

## Phạm vi

Từ migration `0010`, OralAI tổ chức dữ liệu theo **Bộ môn → Môn học → Lớp học → Đợt thi**. Ngân hàng đề thuộc môn học; mỗi đề có category và rubric. Menu **Môn học** quản lý kiến thức, rubric, học viên và cài đặt; menu **Ngân hàng đề thi** dành cho soạn đề, nhập Excel, review và phân loại.

Trang **Người dùng** có bảng thu gọn, tìm theo tên/email/tên đăng nhập và lọc vai trò. Giao diện quản lý giảm khoảng trống; màn hình ghi bài trên desktop giữ luồng hiện có.

## Dữ liệu và lịch thi

| Dữ liệu | Vai trò |
| --- | --- |
| `departments` | Mã bộ môn duy nhất và tên bộ môn |
| `courses.department_id` | Bộ môn của môn; có thể chưa phân bộ môn đối với dữ liệu cũ |
| `teaching_classes` | Mã lớp duy nhất, tên, một môn, giáo viên được phân công, bắt đầu/kết thúc |
| `class_students` | Thành viên lớp và MSSV; không trùng tài khoản/MSSV trong một lớp |
| `exams.category` | Nhãn category tối đa 100 ký tự; lọc cùng rubric trên giao diện ngân hàng |
| `exams.class_id`, `source_exam_id` | Liên kết đợt thi tới lớp và đề nguồn |
| `assignments` | Danh sách và lịch riêng cho mỗi đợt thi |

Đề nguồn được sinh/review như trước. Sau khi giảng viên duyệt (`TEACHER_APPROVED`), admin/khảo thí bấm **Duyệt vào ngân hàng đề**. API yêu cầu đề chưa có roster/lượt thi, công bố với `workflow=true` và không tạo assignment; sinh viên đăng ký môn không được mở đề nguồn. Kỳ thi đã có roster tiếp tục dùng luồng duyệt/xếp lịch cũ.

Khi tạo đợt thi, khảo thí/admin chọn đề **đã công bố**, cùng môn, có snapshot câu hỏi và không phải bài luyện tập. Server sao chép câu hỏi, rubric snapshot, blueprint, cấu hình AI/STT và số lượt của đề nguồn thành một `Exam` mới có `workflow=true`. Mỗi đợt có ID, danh sách, lịch, lượt thi và kết quả độc lập, kể cả khi dùng lại cùng đề hoặc cùng sinh viên ở nhiều lớp.

Lịch mở/đóng phải nằm trong thời gian lớp, đủ thời lượng bài và chưa kết thúc. Server kiểm tra danh sách và lịch khi sinh viên mở/bắt đầu bài. Tham gia môn hoặc lớp khác không cấp quyền vào đợt này.

Danh sách đợt thi là snapshot các sinh viên STUDENT/ACTIVE trong lớp lúc tạo. Thêm/gỡ thành viên sau đó chỉ ảnh hưởng đợt tạo mới; không sửa roster hay xóa điểm của các đợt cũ. Cần chốt danh sách lớp trước khi tạo đợt thi. Đợt đã tạo giữ lịch; nếu cần lịch/danh sách khác, tạo đợt mới. Thời gian lớp không được thu hẹp vượt qua lịch của đợt đã tạo.

## Quyền

| Thao tác | ADMIN | EXAM_OFFICER | TEACHER |
| --- | --- | --- | --- |
| Tạo/sửa/xóa bộ môn, gắn môn vào bộ môn | Có | Có | Không |
| Tạo/sửa/xóa lớp, quản lý sinh viên, tạo đợt thi | Có | Có | Không |
| Phân công giáo viên hoặc nhập phân công Excel | Có | Có | Không |
| Xem lớp, roster, các lần thi và điểm | Mọi lớp | Mọi lớp | Chỉ lớp được phân công |
| Xem transcript/minh chứng và chấm lại thủ công | Có | Chỉ xem | Chỉ lớp được phân công |
| Yêu cầu AI nhận dạng/chấm lại theo chức năng cũ | Có | Không | Không |

Quyền lớp được kiểm tra ở API, bao gồm danh sách kết quả, chi tiết bài, tải minh chứng và chấm lại. Giáo viên sở hữu môn không tự có quyền vào bài của lớp giao cho giáo viên khác. Đổi phân công áp dụng ngay cho request tiếp theo. Phân công lớp không thay `courses.owner_id` hoặc cấp quyền sửa toàn bộ môn/ngân hàng đề.

Quyền quản lý nội dung môn và các đề/kỳ thi cũ tiếp tục dùng cơ chế chủ sở hữu môn. **Điều phối kỳ thi** giữ luồng soạn/duyệt kỳ thi cũ; các đợt của lớp hiển thị tại **Lớp học → Đợt thi & kết quả**.

## Excel

- **Nhập phân công giáo viên theo lớp**: tải mẫu tại trang Lớp học. Hai cột `class_code`, `teacher_username`; lớp và tài khoản TEACHER/ACTIVE phải tồn tại. Mỗi lớp chỉ xuất hiện một lần trong file. Không tạo tài khoản hoặc đổi vai trò qua file này.
- **Nhập sinh viên vào lớp**: mẫu gồm `student_number`, `email`, `full_name`, `initial_password`. Có thể tạo tài khoản STUDENT mới; email đã có phải thuộc duy nhất một sinh viên đang hoạt động. Mật khẩu nhập mới có 12–128 ký tự; để trống sinh mật khẩu ngẫu nhiên không hiển thị, sinh viên cần đăng nhập Google đã cấu hình hoặc được cấp quyền truy cập phù hợp.
- Giới hạn file 2 MB, phân công tối đa 1.000 dòng, sinh viên tối đa 5.000 dòng. Chặn công thức, file giải nén quá lớn và trùng MSSV/email. File có lỗi rollback toàn bộ, kể cả tài khoản vừa tạo. Nhập lại cùng sinh viên không nhân đôi thành viên lớp.
- Phân công, thay đổi thành viên, tạo đợt và chấm điểm có audit; không lưu mật khẩu trong audit.

## API chính

Các đường dẫn dưới đây có tiền tố `/admin` ở API và `/api/admin` từ web.

| Đường dẫn | Chức năng |
| --- | --- |
| `GET/POST /departments`, `PUT/DELETE /departments/{id}` | Danh mục bộ môn |
| `PUT /courses/{id}/department` | Gắn/bỏ bộ môn |
| `GET/POST /classes`, `GET/PUT/DELETE /classes/{id}` | Danh mục và chi tiết lớp |
| `POST /classes/{id}/students`, `DELETE /classes/{id}/students/{student_id}` | Quản lý thành viên |
| `POST /classes/{id}/import-students` | Nhập sinh viên từ Excel |
| `GET /class-students/template.xlsx` | Mẫu danh sách lớp |
| `GET /class-teachers/template.xlsx`, `POST /class-teachers/import` | Mẫu/nhập phân công |
| `POST /classes/{id}/rounds` | Tạo đợt từ đề đã công bố |
| `GET /classes/{id}/rounds/{exam_id}/results` | Danh sách sinh viên, tất cả lượt thi, điểm; bao gồm người chưa thi |
| `POST /exams/{id}/bank-approve` | Duyệt đề nguồn đã được giảng viên duyệt, không cần roster |
| `PUT /exams/{id}/category` | Phân loại đề nguồn |

Review/chấm lại sử dụng API kết quả và minh chứng hiện có, với kiểm tra quyền lớp qua `exam_access`.

## Nâng cấp và xóa dữ liệu

Triển khai web/API/worker đồng bộ; chạy `alembic upgrade head` hoặc `docker compose up -d --build --wait`. Migration `0010` giữ dữ liệu cũ, để trống bộ môn/lớp/category; không tự suy diễn lớp từ danh sách môn cũ. Không cần biến môi trường mới, không xóa volume.

Chỉ xóa bộ môn khi không còn môn trực thuộc. Xóa lớp chưa có đợt thi sẽ xóa thành viên lớp, giữ tài khoản và môn. Lớp đã có đợt thi bị chặn xóa để giữ lịch sử/điểm. Chức năng admin xóa toàn bộ môn bằng mã xác nhận cũng xóa lớp/đợt thi trực thuộc và tiếp tục dùng hàng đợi dọn media hiện có.
