# Nhiều vai trò và quyền quản trị

Một tài khoản có thể có đồng thời `ADMIN`, `EXAM_OFFICER`, `TEACHER`,
`STUDENT`. Quyền được cộng gộp; `ADMIN` có mọi quyền. Trong **Người dùng**,
admin chọn checkbox khi tạo tài khoản hoặc mở **Vai trò → Lưu quyền** để sửa.
Bộ lọc tìm trên mọi vai trò được cấp cho tài khoản.

## Hành vi

- TEACHER + EXAM_OFFICER vừa soạn/duyệt đề vừa điều phối kỳ thi, có phạm vi
  truy cập của khảo thí. TEACHER đơn lẻ giữ phạm vi môn/lớp được phân công.
- STUDENT + vai trò quản lý dùng cùng tài khoản trên web và desktop. ADMIN
  cũng có thể làm bài trên desktop; lịch, danh sách giao bài, số lượt và
  điều kiện thi vẫn áp dụng. Quyền admin không tự ghi danh vào lớp/kỳ thi.
- Hồ sơ tổng hợp cả lớp dạy, lớp học và lịch sử thi; không chọn loại lớp chỉ
  dựa trên vai trò chính. Quyền xem hồ sơ người khác vẫn theo phạm vi quản lý.
- Mỗi request đọc quyền hiện tại từ database, nên thu hồi quyền có hiệu lực
  với phiên đang đăng nhập. Người dùng không tự cấp thêm quyền.
- Luôn giữ ít nhất một ADMIN đang hoạt động; đổi quyền khóa các admin theo
  thứ tự và đếm lại sau khi lấy khóa để xử lý yêu cầu đồng thời.
- Excel giữ quyền tài khoản có sẵn. Google chỉ tự liên kết email với tài
  khoản nhập danh sách thi có duy nhất STUDENT; không liên kết tự động với
  tài khoản có thêm quyền nhân sự.

## Dữ liệu và API

Migration **0012** (sau 0011) tạo `user_roles(user_id, role)` với khóa chính
ghép và quan hệ xóa theo tài khoản. `users.role` được giữ để tương thích;
quyền hiệu lực là hợp của trường này và bảng mới. Tài khoản cũ không cần
ghi lại dữ liệu; vai trò cũ vẫn có hiệu lực khi bảng mới chưa có grant.

API trả `roles` và `role`. `POST /admin/users` nhận `roles`; nếu chỉ gửi
`role` thì tạo một vai trò như trước. `PUT /admin/users/{id}/roles` nhận
`{"roles":["TEACHER","EXAM_OFFICER"]}` và thay toàn bộ tập vai trò. Endpoint
cũ `/role` vẫn nhận `{"role":"TEACHER"}` để thay bằng một vai trò. Tập quyền
không được rỗng và chỉ nhận bốn giá trị trên. Audit lưu mảng trước/sau.

Vai trò chính tương thích được chọn theo thứ tự ADMIN, EXAM_OFFICER,
TEACHER, STUDENT. Client mới dùng `roles`, fallback `role` cho dữ liệu cũ;
không dùng vai trò chính để quyết định mọi quyền. Backend tập trung kiểm
tra trong `app/permissions.py`. Bộ lọc danh sách sinh viên yêu cầu STUDENT
được cấp rõ ràng để không tự đưa tất cả admin vào danh sách ghi danh.

## Triển khai và kiểm thử

Nâng Alembic lên `head` và triển khai API/web cùng phiên bản. Downgrade về
0011 xóa bảng nhiều vai trò, chỉ giữ vai trò chính trong `users.role`.
Các kiểm thử dùng database tạm; không tự sửa vai trò trên domain chính.
Xem [biên bản kiểm thử](../validation.md) và
[bố cục Điều phối kỳ thi](examination-workflow.md).
