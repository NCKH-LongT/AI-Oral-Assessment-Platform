# Cập nhật OralAI qua Jenkins

[README / danh mục tài liệu](../README.md#hướng-dẫn-theo-nhu-cầu) · [Hướng dẫn sử dụng](user-guide.md) · [Jenkinsfile](../Jenkinsfile)

Jenkins build, kiểm thử và triển khai web/API/worker. Bộ cài desktop được tạo riêng bằng workflow **Desktop installers** trên GitHub Actions.

## Điều kiện của job hiện tại

Các giá trị dưới đây lấy từ `Jenkinsfile` đang có trong repo:

| Thành phần | Thiết lập |
| --- | --- |
| Agent | Nhãn `docker`, có Python 3, Docker và Docker Compose |
| SCM | Repository này, nhánh triển khai `main`; credential Git được chọn trong cấu hình job |
| Biến môi trường triển khai | Jenkins credential loại **Secret file**, ID `oral-ai-env` |
| Reverse proxy | Docker network ngoài `nginx-network` |
| Domain triển khai | `https://oral-test.paperlens.uk` |
| Cổng trên host | Web `127.0.0.1:13000`, MinIO console `127.0.0.1:19001` |

Trong credential, `PUBLIC_ORIGIN` và `ALLOWED_ORIGINS` phải khớp domain trên; `COOKIE_SECURE=true`, `WEB_BIND=127.0.0.1`, `WEB_PORT=13000`, `MINIO_CONSOLE_PORT=19001`. Các biến database, storage và AI cần giữ giá trị phù hợp với server đang chạy. Sửa `.env` trên máy phát triển không tự cập nhật credential Jenkins.

Jenkinsfile này dành cho địa chỉ triển khai trên. Nếu đổi domain, network hoặc cổng, phải cập nhật cả cấu hình pipeline, credential và reverse proxy tương ứng.

## Chạy một bản cập nhật

1. Commit và push thay đổi lên nhánh mà job theo dõi.
2. Mở job Jenkins, bấm **Build Now** nếu job chưa được webhook kích hoạt.
3. Trong **Console Output**, kiểm tra bước **Checkout** lấy đúng commit mong muốn.
4. Theo dõi các bước **Build API → Test API - isolated SQLite → Build and check web → Deploy Oral web**.
5. Khi job báo `SUCCESS`, mở web quản trị và đăng nhập kiểm tra. Đóng rồi mở lại desktop để tải giao diện server mới.

Test API lỗi sẽ chặn các bước build web và deploy tiếp theo. Không coi việc push thành công hoặc bước build image thành công là đã triển khai xong.

## Lỗi kiểm thử thiếu thuật ngữ tiếng Anh

Commit `1932aab` thêm trường bắt buộc `english_terms` nhưng hai bộ dữ liệu kiểm thử Gemini/Ollama còn thiếu trường này. Dấu hiệu trong log:

```text
test_enable_gemini_preserves_whisper_policy_and_grades_text
test_local_ollama_grades_submitted_text_without_cloud
POST /admin/exams/.../publish -> 500
type=ValidationError
ERROR: API tests failed; deployment skipped
```

Đã sửa tại commit `b546e84`. Chạy build mới lấy commit này hoặc commit sau đó. Không cần đổi API key hay credential `oral-ai-env` để sửa lỗi fixture này.

Bản sửa đã chạy đầy đủ test API trong container cô lập mạng: **62 passed, 5 skipped**. Các ca bỏ qua cần PostgreSQL; stage này chủ động dùng SQLite. Kết quả này là kiểm tra bản sửa, không thay cho trạng thái job Jenkins bạn đang chạy.

## Chẩn đoán lỗi khác

| Bước lỗi | Cách kiểm tra |
| --- | --- |
| Checkout | Nhánh/commit, quyền đọc repo và credential SCM |
| Preflight | Docker agent, Compose, network `nginx-network` và các Dockerfile |
| Build API / web | Dòng lỗi đầu tiên của lệnh build, dependency và kết nối tải package |
| Test API | Tên ca `FAILED`, lỗi trước HTTP 500 và báo cáo JUnit; đối chiếu commit đã checkout |
| Deploy | Thông báo kiểm tra domain, cổng, credential, migration hoặc trạng thái dịch vụ |

Các dòng `DeprecationWarning` và `No suitable checks publisher found` trong log lỗi vừa gặp không phải nguyên nhân làm 4 test thất bại. Tìm lỗi đầu tiên và phần tổng kết `FAILED` trước khi chỉnh cấu hình.

Pipeline không tự downgrade database hoặc rollback khi deploy thất bại. Giữ volume dữ liệu để kiểm tra và khắc phục. Không xóa volume để xử lý lỗi test.

## Cập nhật desktop sau server

- **Chỉ đổi web/API:** triển khai server rồi mở lại desktop.
- **Đổi Electron/preload hoặc gỡ chức năng local:** người chạy source cập nhật repo, chạy `npm ci` khi dependency đổi rồi mở lại app. Người dùng bộ cài cần bản desktop mới.
- **Đổi helper/model STT:** build lại bundle và bộ cài theo [hướng dẫn đóng gói](desktop-build.md).

Push lên `main` không tự tạo bộ cài: vào GitHub Actions → **Desktop installers → Run workflow**, chọn nhánh cần build rồi tải artifact đúng hệ điều hành.
