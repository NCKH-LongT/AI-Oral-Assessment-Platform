# Tài khoản, giao môn học và desktop

[README / danh mục tài liệu](../../README.md#hướng-dẫn-theo-nhu-cầu)

## Đăng nhập và quyền

- Hệ thống hỗ trợ đăng nhập bằng mật khẩu và Google. Google OIDC dùng authorization code + PKCE, scope `openid email profile`.
- ADMIN nhập OAuth Client ID/Client Secret loại **Web application**, bật đăng nhập và đặt domain gốc trong **Cấu hình hệ thống → Đăng nhập Google**. Trong Google Cloud Console thêm redirect URI chính xác `https://DOMAIN/api/auth/google/callback`; localhost được dùng HTTP. Cấu hình màn hình đồng ý và test users nếu ứng dụng Google đang ở chế độ Testing.
- Web trên server đi qua redirect Google. Web local mở cửa sổ đăng nhập của backend; desktop mở trình duyệt hệ thống. Hai client local giữ poll token trong bộ nhớ, poll kết quả và nhận cookie từ backend; access/refresh token được truyền qua cookie.
- Electron kiểm tra renderer gửi yêu cầu và chỉ mở `/api/auth/google/start` có `flow_id` trên origin của backend đã chọn. Callback Google dùng domain gốc của backend. Bộ cài dùng origin máy chủ cấu hình trong app; launcher source có thể dùng UI local với origin đăng nhập riêng.
- Backend xác minh chữ ký/audience/issuer/expiry ID token bằng `google-auth`, kiểm tra nonce và email đã xác minh, gắn danh tính theo Google `sub`. Email Google đã xác minh có thể liên kết với duy nhất tài khoản STUDENT/ACTIVE do nhập danh sách thi tạo (`sv-…`). Tài khoản quản trị, giảng viên và tài khoản tạo thủ công không được tự liên kết theo email. Khi cần tạo tài khoản Google, role mặc định là STUDENT.
- OAuth state dùng cookie HttpOnly, SameSite=Lax và bản hash trong database; code/flow chỉ dùng một lần. Flow hết hạn sau 5 phút, được dọn khi tạo flow mới. Redis giới hạn tạo flow. Cookie ứng dụng dùng Secure khi domain gốc là HTTPS. Không ghi query OAuth vào access log API trong Docker.
- **Người dùng → Vai trò → Lưu quyền** cho phép ADMIN phân role STUDENT/TEACHER/REVIEWER/EXAM_OFFICER/ADMIN. Mỗi request đọc vai trò hiện tại từ database, nên quyền thay đổi ngay với phiên đang có. Hệ thống yêu cầu luôn có ít nhất một ADMIN/ACTIVE. Audit lưu người đổi, đối tượng và vai trò trước/sau.

Tham khảo: [Google web-server OAuth](https://developers.google.com/identity/protocols/oauth2/web-server), [Google OpenID Connect](https://developers.google.com/identity/openid-connect/openid-connect).

## Môn mặc định và giao môn

Bootstrap tạo idempotent môn **Luyện tập vấn đáp** và đề **Thi thử: Làm quen hệ thống** gồm hai câu hỏi có sẵn. Không gọi AI/Google khi tạo, không cần key để xem/thi thử. Desktop dùng PhoWhisper-small hoặc Whisper-small theo lựa chọn trên thiết bị. Trình duyệt dùng policy STT đã cấu hình; nếu chọn Whisper server thì server cần tải model lần đầu. Bài luyện tập lưu minh chứng và transcript nhưng không tính điểm chính thức. Mọi vai trò đều truy cập được từ **Bài thi của tôi** hoặc **Học & thi thử**; môn được nhận diện bằng ID cố định, không dựa vào tên/mã có thể sửa.

ADMIN vào môn → **04 · Học viên**, tìm tài khoản và **Thêm vào môn học**. Bảng `course_enrollments` lưu thành viên môn; đề PUBLISHED có `workflow=false` được hiển thị theo đăng ký môn hoặc giao bài riêng. Đề có `workflow=true` yêu cầu sinh viên thuộc danh sách kỳ thi và vào thi đúng lịch. Học viên bấm **Làm mới bài thi** để tải danh sách. Đề nháp bị ẩn và API chặn truy cập. Xóa thành viên khỏi môn giữ nguyên kết quả/phiên thi đã tạo và assignment riêng. Quyền vào một môn chỉ áp dụng cho dữ liệu học tập của chính học viên. Xem [quy trình khảo thí](examination-workflow.md).

Số lượt do chính sách từng đề và lượt cấp thêm quyết định. Học viên có thể mở kết quả cũ hoặc tạo lượt mới khi còn quyền; hệ thống giữ lịch sử các lần thi. Xem [quản lý lượt thi](exam-retakes.md) và [hướng dẫn sử dụng](../user-guide.md#xem-kết-quả-và-làm-lại).

## Giao diện quản lý

Kiến thức chia thành năm tab con: Giáo trình / Chuẩn đầu ra / Chủ đề / Tài liệu bổ sung / Tra cứu kiến thức. Chủ đề, chương/mục, rubric và đề thi có nút tạo/sửa mở dialog có focus trap và hỗ trợ Escape; danh sách thu gọn tiêu chí, blueprint và giao riêng đề. Trang học viên lọc bài theo môn. Cấu hình hệ thống chia AI, đăng nhập Google và STT.

## Cấu hình dịch vụ

`GET/PUT /admin/settings/platform` chỉ ADMIN. Cho phép cấu hình Gemini provider/key, model chấm/embedding, model Whisper server, OAuth client, domain gốc. Trường secret bỏ trống giữ nguyên; checkbox xóa là thao tác riêng. Response chỉ trả cờ đã cấu hình, không trả khóa. Thông tin lưu atomic trong `DATA_DIR/secrets/platform.json` quyền 600, thư mục 700; API/worker dùng volume chung. Mặc định `AI_CONFIG_SOURCE=env`: tab AI chỉ hiển thị cấu hình từ môi trường, không lưu key/model AI vào file này. `AI_CONFIG_SOURCE=admin` mới cho phép sửa AI trên web. Gemini nhận dạng lại dùng API key, không cần JSON STT; Google Cloud STT dùng JSON upload riêng trong tab STT, và admin có thể chọn Gemini/Google khi nhận dạng lại.

Cấu hình Google ban đầu cũng nhận từ `.env`: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_LOGIN_ENABLED` và `PUBLIC_ORIGIN`. Sau khi điền credential và bật cờ, recreate API/worker bằng `docker compose up -d --no-deps --force-recreate api worker` để nạp biến mới. Các trường OAuth trong `platform.json` được ưu tiên hơn biến môi trường, kể cả giá trị `false` hoặc secret đã xóa; khi đã lưu cấu hình hệ thống trên web, tiếp tục đổi qua admin để tránh giá trị `.env` bị cấu hình web ghi đè. Để trống secret trên web giữ lại giá trị hiện hành, bao gồm secret ban đầu từ môi trường. Mẫu `.env.example` không chứa credential thật.

API và worker đọc cấu hình mới cho request/job tiếp theo, giữ một bản cấu hình nhất quán trong suốt request/job đang xử lý. Mỗi đề đã công bố giữ snapshot provider/model; đổi provider/model có thể làm đề cũ cần giảng viên xem lại. Khi đổi embedding model/provider, tải lại tài liệu trong phạm vi mới và công bố đề mới; không tự chấm lại lịch sử hoặc biến vector demo thành vector Gemini. Thay key cùng provider/model không cần dựng lại đề.

`public_origin` là domain truy cập từ bên ngoài, không phải địa chỉ API nội bộ Docker. DNS, reverse proxy và TLS cần cấu hình riêng; nhập domain trên web không tự tạo DNS/certificate. Các thiết lập hạ tầng như database, Redis, storage và bootstrap admin vẫn ở `.env`. Không đưa secrets vào Git, bộ cài hoặc frontend. Khi backup cần bảo vệ cả database và volume `app_data` chứa cấu hình/credentials.

## Kết nối backend trên web local và desktop

Chạy `npm run dev` để mở giao diện source tại `http://localhost:3001`. `npm run desktop` mở Electron và khởi động giao diện local nếu cần. Thanh **Backend** cho phép chọn:

| Chế độ | Máy chủ mặc định |
| --- | --- |
| Online | `https://oral-test.paperlens.uk` |
| Local | `http://localhost:3000` |

Các biến `.env` gồm `ORAL_BACKEND_MODE`, `ORAL_LOCAL_BACKEND_URL`, `ORAL_ONLINE_BACKEND_URL` và `ORAL_CLIENT_PORT`. Mặc định là Online khi profile chưa lưu lựa chọn. Bộ chọn kiểm tra kết nối trước khi tải lại giao diện; phiên đăng nhập tách riêng theo backend. Bản ghi chưa nộp chặn chuyển chế độ; tab đang dùng backend khác phải tải lại trước khi gửi yêu cầu API.

Giao diện local chuyển tiếp `/api` tới backend đã chọn, kiểm tra origin của request và chỉ gửi cookie thuộc backend đó. STT desktop xử lý trên thiết bị; dữ liệu môn, lịch thi, bài nộp và chấm điểm thuộc server được chọn. `AI_PROVIDER` cấu hình LLM tại server, độc lập với lựa chọn Local/Online của client.

`npm run desktop:server` mở trực tiếp UI tại `ORAL_WEB_URL` hoặc máy chủ đã lưu. Bộ cài desktop chọn domain tại **OralAI → Cấu hình máy chủ…**.

## Dữ liệu tài khoản và tài nguyên desktop

`users.email` lưu email, Google `sub` là định danh duy nhất; bảng OAuth flow quản lý phiên đăng nhập và `course_enrollments` quản lý thành viên môn. Middleware API ghi request ID/method/path/status, giữ query OAuth ngoài access log Docker.

Bộ cài desktop chứa runtime STT, FFmpeg, PhoWhisper-small và Whisper-small CPU INT8. Desktop gửi media gốc và transcript local để server chấm bằng Ollama/Gemini. Hướng dẫn: [Desktop đa nền tảng](../desktop-build.md).

Học viên kiểm tra và sửa transcript bằng tay trước khi nộp; giảng viên xem/nghe minh chứng đã upload khi review bài. Xem [kiểm tra transcript](../transcript-correction.md).
