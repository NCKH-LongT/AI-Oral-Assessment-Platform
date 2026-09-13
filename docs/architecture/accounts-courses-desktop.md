# Tài khoản Google, giao môn học và desktop — 13/09/2026

## Đăng nhập và quyền

- Đăng nhập mật khẩu hiện có vẫn hoạt động. Google OIDC dùng authorization code + PKCE, scope `openid email profile`; không đọc/gửi Gmail.
- ADMIN nhập OAuth Client ID/Client Secret loại **Web application**, bật đăng nhập và đặt domain gốc trong **Cấu hình hệ thống → Đăng nhập Google**. Trong Google Cloud Console thêm redirect URI chính xác `https://DOMAIN/api/auth/google/callback`; localhost được dùng HTTP. Cấu hình màn hình đồng ý và test users nếu ứng dụng Google đang ở chế độ Testing.
- Web đi qua redirect Google. Desktop mở trình duyệt hệ thống; không nhúng màn hình Google trong Electron. Desktop giữ poll token trong bộ nhớ, poll kết quả và nhận cookie từ backend; không chuyển access/refresh token qua URL.
- Backend xác minh chữ ký/audience/issuer/expiry ID token bằng `google-auth`, kiểm tra nonce và email đã xác minh, gắn danh tính theo Google `sub`. Tài khoản mới luôn là STUDENT. Không tự ghép vào tài khoản mật khẩu chỉ vì username giống email; điều này tránh cấp nhầm quyền admin. Nếu đã có tài khoản mật khẩu, đăng nhập Google tạo tài khoản riêng để admin giao lại môn/quyền khi cần.
- OAuth state dùng cookie HttpOnly, SameSite=Lax và bản hash trong database; code/flow chỉ dùng một lần. Flow hết hạn sau 5 phút, được dọn khi tạo flow mới. Redis giới hạn tạo flow. Cookie ứng dụng dùng Secure khi domain gốc là HTTPS. Không ghi query OAuth vào access log API trong Docker.
- **Người dùng → Vai trò → Lưu quyền** cho phép ADMIN đổi STUDENT/TEACHER/REVIEWER/ADMIN của bất kỳ tài khoản. Mỗi request đọc vai trò hiện tại từ database, nên quyền thay đổi ngay với phiên đang có. Không được bỏ admin ACTIVE cuối cùng. Audit lưu người đổi, đối tượng và vai trò trước/sau.

Tham khảo: [Google web-server OAuth](https://developers.google.com/identity/protocols/oauth2/web-server), [Google OpenID Connect](https://developers.google.com/identity/openid-connect/openid-connect).

## Môn mặc định và giao môn

Bootstrap tạo idempotent môn **Luyện tập vấn đáp** và đề **Thi thử: Làm quen hệ thống** gồm hai câu hỏi có sẵn. Không gọi AI/Google khi tạo, không cần key để xem/thi thử. STT vẫn dùng provider đã cấu hình; Whisper server mặc định cần tải model lần đầu. Bài luyện tập lưu minh chứng và transcript nhưng không tính điểm chính thức. Mọi vai trò đều truy cập được từ **Bài thi của tôi** hoặc **Học & thi thử**; môn được nhận diện bằng ID cố định, không dựa vào tên/mã có thể sửa.

ADMIN vào môn → **04 · Học viên**, tìm tài khoản và **Thêm vào môn học**. Bảng `course_enrollments` lưu thành viên môn; danh sách bài thi truy vấn trực tiếp các đề PUBLISHED trong môn, nên cả đề công bố sau khi giao môn cũng xuất hiện. Học viên bấm **Làm mới bài thi** để cập nhật danh sách đang mở. Đề nháp bị ẩn và API cũng chặn truy cập. Giao riêng một đề vẫn được hỗ trợ trong mục thu gọn của đề đó. Gỡ khỏi môn không xóa kết quả/phiên thi đã tạo và không thu hồi các assignment riêng. Quyền vào một môn không cấp quyền chỉnh sửa hay xem bài của người khác.

Mỗi người vẫn có tối đa một lượt cho mỗi đề theo quy tắc hiện tại; mở lại trả phiên/kết quả cũ, kể cả đề luyện tập. Chưa triển khai tạo nhiều lượt thi thử cho cùng đề.

## Giao diện quản lý

Kiến thức chia thành năm tab con: Giáo trình / Chuẩn đầu ra / Chủ đề / Tài liệu bổ sung / Tra cứu kiến thức. Chủ đề, chương/mục, rubric và đề thi có nút tạo/sửa mở dialog có focus trap và hỗ trợ Escape; danh sách thu gọn tiêu chí, blueprint và giao riêng đề. Trang học viên lọc bài theo môn. Cấu hình hệ thống chia AI, đăng nhập Google và STT.

## Cấu hình dịch vụ

`GET/PUT /admin/settings/platform` chỉ ADMIN. Cho phép cấu hình Gemini provider/key, model chấm/embedding, model Whisper server, OAuth client, domain gốc. Trường secret bỏ trống giữ nguyên; checkbox xóa là thao tác riêng. Response chỉ trả cờ đã cấu hình, không trả khóa. Thông tin lưu atomic trong `DATA_DIR/secrets/platform.json` quyền 600, thư mục 700; API/worker dùng volume chung. JSON service account STT vẫn dùng endpoint upload hiện có và file riêng.

API và worker đọc cấu hình mới cho request/job tiếp theo, giữ một bản cấu hình nhất quán trong suốt request/job đang xử lý. Mỗi đề đã công bố giữ snapshot provider/model; đổi provider/model có thể làm đề cũ cần giảng viên xem lại. Khi đổi embedding model/provider, tải lại tài liệu trong phạm vi mới và công bố đề mới; không tự chấm lại lịch sử hoặc biến vector demo thành vector Gemini. Thay key cùng provider/model không cần dựng lại đề.

`public_origin` là domain truy cập từ bên ngoài, không phải địa chỉ API nội bộ Docker. DNS, reverse proxy và TLS cần cấu hình riêng; nhập domain trên web không tự tạo DNS/certificate. Các thiết lập hạ tầng như database, Redis, storage và bootstrap admin vẫn ở `.env`. Không đưa secrets vào Git, bộ cài hoặc frontend. Khi backup cần bảo vệ cả database và volume `app_data` chứa cấu hình/credentials.

## Migration và desktop

Migration `0003` thêm `users.email`, Google `sub` duy nhất, bảng OAuth flow và enrollment; giữ tài khoản, môn, đề và kết quả cũ. Bootstrap bổ sung môn luyện tập ở lần cập nhật tiếp theo. Dockerfile API tắt access log mặc định có query string; middleware vẫn ghi request ID/method/path/status.

Hướng dẫn build, cấu hình domain và STT local: [Desktop đa nền tảng](../desktop-build.md).
