- ở trang người dùng format lại giao diện cho gọn và tiết kiệm diện tích lại
- nên tách menu môn học & đề thi thành 2 menu khác nhau, quản lý môn học là riêng, và tạo đề thi cho môn học đó là riêng
- có chức năng quản lý Bộ môn -> môn 
- có chức năng quản lý lớp : có thể thêm xóa tạo lớp, trong lớp sẽ có danh sách học sinh, và gắn với 1 môn học, lớp sẽ có cấu hình thời gian bắt đầu, kết thúc, và các bài test theo thời gian, có thể chọn bài test từ ngân hàng đề thi
- trong môn học sẽ có chức năng quản lý ngân hàng đề thi cho môn học đó, có phân chia theo category, rubric,...
- trong lớp sẽ có chỗ để xem các bài thi của từng đợt thi của lớp đó, có thể xem điểm, hoặc chấm lại. 
- admin, khảo thí mới có quyền quản lý lớp, bộ môn, 
- giáo viên được khảo thi phân vào lớp hoặc được import theo lớp

## Đã triển khai — 18/10/2026

- [x] Thu gọn giao diện quản lý/người dùng; thêm tìm kiếm và lọc vai trò.
- [x] Tách menu Môn học và Ngân hàng đề thi.
- [x] CRUD bộ môn và gắn môn vào bộ môn.
- [x] CRUD lớp theo môn, thời gian bắt đầu/kết thúc, danh sách sinh viên và nhập Excel.
- [x] Tạo đợt thi từ bản sao đề đã công bố, lịch và roster riêng cho từng đợt.
- [x] Phân loại ngân hàng theo category, lọc category/rubric.
- [x] Xem các lượt thi/điểm theo đợt trong lớp, mở minh chứng và chấm lại.
- [x] Chỉ admin/khảo thí quản lý bộ môn/lớp; giáo viên xem/chấm lớp được giao.
- [x] Phân công giáo viên trực tiếp hoặc nhập Excel theo mã lớp.

Migration: `0010`. Đợt đã tạo giữ roster/lịch, thay đổi thành viên lớp áp dụng cho đợt tiếp theo. Xóa lớp đã có đợt thi bị chặn để giữ lịch sử. Xem [hướng dẫn sử dụng](docs/user-guide.md), [thiết kế và phân quyền](docs/architecture/academic-classes.md), [kết quả kiểm thử](docs/validation.md).

## Bổ sung — 19/10/2026

- [x] Người dùng → Chi tiết: profile, lớp đã/đang/sẽ học và MSSV.
- [x] Chi tiết lớp theo người dùng: lịch các đợt, trạng thái chưa thi, từng lượt và mở chi tiết bài làm/minh chứng/chấm lại theo quyền.
- [x] Giữ lịch sử sau khi rời lớp; lọc phạm vi lớp giáo viên phụ trách.
- [x] Desktop mô tả các quy định ở trang đăng nhập, danh sách bài và trong lượt thi.
- [x] Admin bật/tắt 10 quy định tại Cấu hình hệ thống → Quy định desktop; lưu audit và snapshot từng lượt.
- [x] Tắt camera: chỉ ghi/upload audio; tắt màn hình: không yêu cầu screen consent/upload; các công tắc còn lại áp dụng trong Electron/luồng thi.

Migration `0011`. Cần build/cài desktop mới hoặc mở lại Electron source đã cập nhật. [Chi tiết thiết kế và ràng buộc](docs/architecture/user-profiles-desktop-policy.md); [kiểm thử](docs/validation.md).

## Điều hướng menu

- [x] Bấm menu luôn quay về trang gốc của mục đó, kể cả khi menu đang active và đang xem profile, lớp, đợt thi hoặc bài làm bên trong.
