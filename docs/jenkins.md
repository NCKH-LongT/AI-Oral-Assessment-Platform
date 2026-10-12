# Cập nhật OralAI qua Jenkins

[README / danh mục tài liệu](../README.md#hướng-dẫn-theo-nhu-cầu) · [Hướng dẫn sử dụng](user-guide.md) · [Jenkinsfile](../Jenkinsfile)

Jenkins build, kiểm thử và triển khai web/API/worker. Bộ cài desktop được tạo riêng bằng workflow **Desktop installers** trên GitHub Actions.

## Điều kiện của job hiện tại

Các giá trị dưới đây lấy từ `Jenkinsfile` đang có trong repo:

| Thành phần | Thiết lập |
| --- | --- |
| Agent | Nhãn `docker`, có Python 3, Docker, Docker Compose và plugin Buildx |
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
4. Theo dõi các bước **Prepare Docker builder → Build API → Test API - isolated SQLite → Build and check web → Deploy Oral web → Clean old Docker releases**.
5. Khi job báo `SUCCESS`, mở web quản trị và đăng nhập kiểm tra. Đóng rồi mở lại desktop để tải giao diện server mới.

Test API lỗi sẽ chặn các bước build web và deploy tiếp theo. Không coi việc push thành công hoặc bước build image thành công là đã triển khai xong.

## Giữ hai phiên bản và dọn Docker sau deploy

Sau khi web/API qua healthcheck và worker chạy đúng image của build mới, stage **Clean old Docker releases** tự động:

- Giữ tối đa **2 phiên bản image API** (`oral-assessment-api`) và **2 phiên bản image web** (`oral-assessment-web`): bản vừa deploy và bản đang chạy trước đó. API dùng chung cho worker/migration. Nếu không có bản trước khác biệt còn tồn tại, lấy thêm image gần nhất theo thời gian tạo; các tag cùng ID tính là một phiên bản.
- Xóa container đã dừng của project `oral-assessment-web`, container kiểm thử do pipeline tạo, image build/check cũ và image không còn tag có nhãn sở hữu OralAI.
- Dọn cache của builder riêng `oral-assessment-web-jenkins`, dùng driver `docker-container`. Pipeline build bằng `buildx --load` để image có sẵn cho bước kiểm thử/deploy trên Docker daemon.
- In `docker system df` để theo dõi dung lượng sau dọn.

Pipeline chụp ID/reference của image đang chạy ngay trước bước deploy vào `.data/jenkins/previous-images.json`, gắn với đúng build. Image còn được bất kỳ container nào sử dụng sẽ được giữ; khi đó số phiên bản có thể lớn hơn hai và cần kiểm tra container đó. Các image hạ tầng PostgreSQL/Redis/MinIO, volume dữ liệu, backup database và tài nguyên thuộc project khác được giữ nguyên. Không dùng `docker system prune`, không xóa volume và không ép xóa image/container trong bước dọn.

Stage dọn chỉ chạy sau deploy thành công. Nếu dọn gặp lỗi hoặc phát hiện ứng dụng không còn khỏe/đúng image, Jenkins báo **UNSTABLE** để kiểm tra; ứng dụng đã deploy tiếp tục chạy. Nếu build/deploy thất bại, pipeline chỉ dọn container test và image check của chính lượt chạy đó trong `post always`.

Theo [Docker Buildx prune](https://docs.docker.com/reference/cli/docker/buildx/prune/), thao tác dọn áp dụng cho builder được chọn. Cache ở builder dùng chung từ các lượt build trước cần được quản trị riêng vì Docker không phân loại cache đó theo project. Từ pipeline này, cache mới của OralAI nằm trong builder riêng và được dọn sau deploy; lần build sau có thể lâu hơn do cần tải/build lại dependency. Chỉ một job Jenkins nên quản lý deployment và builder này; `disableConcurrentBuilds()` tuần tự hóa các lượt của job đó.

Giữ image trước hỗ trợ thao tác khôi phục ứng dụng, nhưng không tự rollback schema/database. Người vận hành cần kiểm tra tương thích migration trước khi đổi về phiên bản trước.

Logic dọn nằm trong [docker_cleanup.py](../scripts/docker_cleanup.py), được kiểm tra bằng `python3 -m unittest discover -s tests -p test_docker_cleanup.py -v`. Các test dùng Docker giả lập, không dọn dữ liệu thật.

## Chẩn đoán lỗi

| Bước lỗi | Cách kiểm tra |
| --- | --- |
| Checkout | Nhánh/commit, quyền đọc repo và credential SCM |
| Preflight | Docker agent, Compose, network `nginx-network` và các Dockerfile |
| Build API / web | Dòng lỗi đầu tiên của lệnh build, dependency và kết nối tải package |
| Test API | Tên ca `FAILED`, lỗi trước HTTP 500 và báo cáo JUnit; đối chiếu commit đã checkout |
| Deploy | Thông báo kiểm tra domain, cổng, credential, migration hoặc trạng thái dịch vụ |
| Clean old Docker releases | Image/container còn được sử dụng, trạng thái healthcheck và quyền truy cập builder OralAI |

Đối chiếu lỗi đầu tiên và phần tổng kết `FAILED` trước khi chỉnh cấu hình.

Pipeline không tự downgrade database hoặc rollback khi deploy thất bại. Giữ volume dữ liệu để kiểm tra và khắc phục. Không xóa volume để xử lý lỗi test.

## Cập nhật desktop sau server

- **Chỉ đổi web/API:** triển khai server rồi mở lại desktop.
- **Đổi Electron/preload:** người chạy source cập nhật repo, chạy `npm ci` khi dependency đổi rồi mở lại app. Người dùng bộ cài cần bản desktop mới.
- **Đổi helper/model STT:** build lại bundle và bộ cài theo [hướng dẫn đóng gói](desktop-build.md).

Push lên `main` không tự tạo bộ cài: vào GitHub Actions → **Desktop installers → Run workflow**, chọn nhánh cần build rồi tải artifact đúng hệ điều hành.
