# Hồ sơ người dùng và quy định desktop

Bản cập nhật 19/10/2026, migration `0011`.

## Hồ sơ → lớp → đợt thi → bài làm

Trong **Người dùng**, bấm **Chi tiết** hoặc tên người dùng. Hồ sơ gồm tên, email, tài khoản, vai trò, trạng thái và ngày tạo. Sinh viên có danh sách lớp, MSSV trong lớp, môn, giáo viên và thời gian. Giảng viên có danh sách lớp phụ trách; tài khoản không có lớp hiển thị trạng thái trống.

Phân nhóm theo thời gian server: **Đã học** khi `ends_at <= now`; **Sẽ học** khi `starts_at > now`; còn lại là **Đang học**. Đây là trạng thái lịch lớp, không phải xác nhận sinh viên đã hoàn thành chương trình. Có bộ lọc và số lớp từng nhóm.

**Chi tiết lớp** liệt kê những đợt được giao hoặc đã có lượt thi của sinh viên, lịch thi, số lần, trạng thái và điểm đã xác nhận. Đợt chưa có lượt hiển thị **Chưa thi**. **Chi tiết bài thi** mở giao diện review hiện có: lịch sử lượt, transcript, rubric, audio/video/màn hình nếu còn lưu, điểm và chức năng chấm lại theo quyền. Lượt đã xóa mềm bị ẩn; minh chứng đã dọn tuân theo chính sách lưu trữ cũ. Lớp đã gỡ sinh viên vẫn có trong hồ sơ nếu còn assignment hoặc lượt thi; ghi rõ chỉ còn lịch sử. Nút **Quản lý môn học được giao** giữ chức năng đăng ký môn cũ.

Admin/khảo thí xem hồ sơ; giáo viên chỉ truy cập sinh viên trong lớp phụ trách hoặc thuộc phạm vi môn legacy. Các lớp của giáo viên khác bị lọc. API review tiếp tục kiểm tra `exam_access` trên từng yêu cầu, kể cả sau khi đổi phân công. Hồ sơ không trả mật khẩu hoặc token.

- `GET /admin/users/{id}/profile`
- `GET /admin/users/{id}/classes/{class_id}`
- `GET /admin/results/{session_id}` dùng lại cho bài làm.

## Mở desktop và bắt đầu thi

Khi mở app, cửa sổ đăng nhập và sau đó danh sách bài thi hiển thị **Quy định ứng dụng desktop**; mở phần mô tả để xem từng mục bật/tắt. App chưa bật kiosk hoặc tự thu camera/màn hình. Công cụ nhà phát triển được chặn từ lúc mở app nếu công tắc tương ứng bật. Ở màn hình bài thi, phần mô tả dùng quy định đã chốt của chính lượt đó.

Admin vào **Cấu hình hệ thống → Quy định desktop**, bật/tắt từng mục rồi **Lưu quy định desktop**. Giáo viên, khảo thí, sinh viên không được sửa cấu hình này.

| Công tắc | Khi bật | Khi tắt |
| --- | --- | --- |
| Ghi toàn màn hình | Cần đồng ý, quyền chia sẻ màn hình và bản ghi hoàn tất trước khi nộp | Không yêu cầu chia sẻ/upload màn hình |
| Bắt buộc camera | Xin quyền và hiển thị camera đúng tỉ lệ; camera nằm trong video màn hình khi bật ghi màn hình, không ghi VIDEO riêng từng câu | Chỉ xin microphone, chỉ ghi/upload audio |
| Chỉ dùng một màn hình | Kiểm tra số màn hình khi bắt đầu/khôi phục; có công cụ chuẩn bị màn hình | Cho phép nhiều màn hình; nếu vẫn ghi màn hình, chỉ ghi màn hình chứa app khi bắt đầu chia sẻ |
| Khóa toàn màn hình (kiosk) | Kiosk, không thu nhỏ cửa sổ | Cửa sổ thông thường |
| Chặn phím tắt khi thi | Chặn reload, đóng cửa sổ, điều hướng, thoát fullscreen bằng các phím app xử lý | Không chặn nhóm phím này; kiosk và cảnh báo dữ liệu vẫn áp dụng nếu có |
| Chặn clipboard khi thi | Chặn copy/cut/paste/drop/context menu | Cho phép sự kiện clipboard và phím copy/cut/paste |
| Chặn điều hướng khi thi | Chặn chuyển trang của cửa sổ thi | Bỏ chặn bổ sung trong lúc thi; vẫn giới hạn nguồn server/cửa sổ mới |
| Chặn tải xuống khi thi | Chặn download, không chặn upload minh chứng | Cho phép download trong phạm vi app |
| Tạm dừng trả lời khi rời cửa sổ | Dừng câu trả lời khi blur/minimize/rời fullscreen, yêu cầu khôi phục | Tiếp tục trả lời; vẫn lưu sự kiện để review |
| Chặn công cụ nhà phát triển | Chặn F12 và Ctrl/Cmd+Shift+I/J/C | Các phím này mở/đóng DevTools |

Thay đổi màn hình khi đang ghi hoặc khi quy định một màn hình bật vẫn yêu cầu khôi phục. Dừng chia sẻ, lỗi ghi hoặc mất thiết bị bắt buộc vẫn chặn trả lời vì không thể tạo minh chứng hợp lệ. Đồng hồ không dừng theo gián đoạn. Microphone, kết nối server, đăng nhập/quyền bài thi, lịch/số lượt thi, sandbox/context isolation, IPC kiểm tra nguồn, giới hạn server, cảnh báo bản ghi chưa nộp và kiểm tra tính toàn vẹn upload là các yêu cầu kỹ thuật cố định. Chính sách STT/LLM nằm ở các tab cấu hình tương ứng, không thuộc nhóm công tắc khóa desktop.

Các công tắc kiểm soát ứng dụng, không khóa toàn hệ điều hành. Header desktop không chứng thực được bộ cài và sự kiện giám sát không tự kết luận gian lận.

Từ 22/10/2026, audio từng câu và SCREEN theo chính sách là minh chứng cần
nộp; `require_camera` kiểm soát camera preview, không yêu cầu VIDEO camera.
Nếu tắt ghi màn hình thì preview camera không được lưu thành video.
[Thiết kế editor/ghi hình](question-editor-recording.md).

## Lưu cấu hình và tương thích

`SystemSetting.desktop_policy` lưu 10 boolean; mọi lần lưu có audit `DESKTOP_POLICY_UPDATED` kèm before/after. Mặc định các mục bật, riêng ghi màn hình kế thừa `EXAM_SCREEN_REQUIRED` cho tới lần lưu đầu tiên trên admin. Không cần thêm biến môi trường.

Khi tạo lượt thi, server lưu JSON vào `exam_sessions.desktop_policy` và chốt `screen_required`; phiên đã có trước migration dùng các hạn chế cũ và giá trị `screen_required` cũ. Thay cấu hình không đổi lượt đã tạo, kể cả lượt đang kiểm tra thiết bị. Bài practice legacy vẫn giữ ngoại lệ không bắt buộc màn hình. Electron đọc policy trực tiếp qua cookie phiên đăng nhập, không nhận boolean từ renderer. Nếu không tải/xác thực được policy của lượt thì không vào chế độ thi. Khi mở lại bài đang làm, phải khôi phục chế độ thi kể cả bài không yêu cầu ghi màn hình.

- `GET /desktop/policy`: bản công khai gồm version/rules, không có bí mật.
- `GET/PUT /admin/settings/desktop`: chỉ ADMIN, StrictBool, từ chối khóa lạ.
- `GET /exam-sessions/{id}/desktop-policy`: chỉ chủ lượt, chưa xóa, trạng thái DEVICE_CHECK/IN_PROGRESS.
- Preload công bố `policyVersion: 1`, `beginExam(sessionId)`. Web yêu cầu bridge này khi lượt có policy.

Nâng server bằng migration `0011`, cập nhật đồng bộ API/worker/web và **build/cài lại desktop**; source cần đóng rồi mở lại Electron. Chỉ refresh giao diện trong Electron cũ không nạp được IPC mới. Bộ cài phải bao gồm `desktop-policy.cjs` (đã khai báo trong manifest). Chặn DevTools ngoài lượt thi cập nhật khi mở/tải lại app; trong lượt luôn dùng snapshot.
