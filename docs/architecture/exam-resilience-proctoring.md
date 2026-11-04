# Kiểm tra camera và độ bền phiên thi — tiến độ nghiên cứu

Nhánh: codex/exam-resilience-proctoring. Chưa triển khai production.

## Camera

Dùng Face Landmarker trong trình duyệt; đưa suy luận sang Web Worker vì detectForVideo đồng bộ và có thể chặn UI. Giới hạn khoảng 2 mẫu/giây, chỉ một frame đang xử lý, bỏ frame cũ. Chạy ở máy thí sinh giúp 30 người không gửi video về server cho từng lần suy luận.

Nguồn: https://developers.google.com/edge/mediapipe/solutions/vision/face_landmarker/web_js

Đã có hàm assessFraming và kiểm thử. Mốc khởi đầu: đúng một mặt, bounding box nằm trong ảnh với lề 2%, diện tích 6–55%, tâm gần giữa ảnh. Đây là phần trăm diện tích bounding box trên toàn ảnh, không phải xác suất hay phần trăm mặt nhìn thấy. Ngưỡng chưa hiệu chuẩn. Cần ổn định liên tục trước khi cho bắt đầu; lỗi tải model phải hiển thị rõ, không giả là đã kiểm tra.

Mắt: có thể lấy iris/eye landmarks để ước lượng hướng nhìn tương đối sau hiệu chuẩn. Đây không phải eye tracker đã xác thực, không chứng minh gian lận. Không dùng lệch mắt đơn lẻ để loại thí sinh; chỉ cảnh báo và cung cấp thông tin giám sát. Cần phân biệt nhìn lệch với quay đầu, chớp mắt, kính và camera lệch.

## Mạng và bản ghi

Đã thêm IndexedDB lưu media trước yêu cầu nộp, nút phục hồi media theo session và backend, xóa sau xác nhận upload. Chưa phục hồi đầy đủ transcript/idempotency metadata. Chưa lưu từng chunk MediaRecorder khi đang ghi nên crash giữa bản ghi vẫn có nguy cơ mất phần chưa hoàn tất. Chưa chứng minh offline recovery end-to-end.

navigator.onLine chỉ là tín hiệu gợi ý; request thực tế mới quyết định kết nối có hoạt động. Không khóa nút gửi chỉ dựa trên thuộc tính này.
Nguồn: https://developer.mozilla.org/en-US/docs/Web/API/Navigator/onLine

## Kiểm chứng còn phải thực hiện

- Lưu và phục hồi payload submit, idempotency key, audio; tránh gửi nhầm user/backend.
- Dùng Playwright kiểm tra mất kết nối trước submit, giữa chunk, sau server nhận nhưng trước client nhận response; reload và gửi lại không tạo bản trùng.
- Tốc độ mạng thấp, lỗi 429/5xx, timeout có giới hạn; retry có jitter và không lặp vô hạn lỗi 4xx cố định.
- Camera thật/fixture: không mặt, nhiều mặt, thiếu sáng, che mặt, kính, camera chậm, model không tải được; kiểm tra quyền camera và hủy worker khi thoát.
- Tạo 30 tài khoản test, vào thi đồng thời, gửi audio đồng thời; đo p50/p95, tỷ lệ lỗi, CPU/RAM, queue wait. Kiểm tra tranh chấp session/idempotency bằng PostgreSQL. Không suy ra khả năng chịu tải từ unit test hoặc SQLite.
- Phân biệt 30 người làm bài với 30 job AI đang chấm: worker serial chủ ý xếp hàng. Cần hiển thị tiến độ chờ, không mở 30 model cùng lúc.
- Chạy kiểm thử liên quan, build web, review diff, commit và push nhánh lên fork của người dùng.

## Camera đã triển khai trong code

Đã cài MediaPipe tasks-vision 0.10.32. Model float16 phiên bản 1 và WASM phục vụ tại public/vision, có manifest SHA-256. Hook useFaceCheck chạy worker, tối đa một frame đang xử lý, 2 lần/giây. Sáu lần đo liên tiếp hợp lệ mở nút bắt đầu; kết quả quá 3 giây bị coi là cũ. Đây là kiểm tra phía client, chưa phải xác minh danh tính hay cơ chế chống vượt qua API. Theo dõi mắt còn phải phát triển. TypeScript và ba kiểm thử hình học đã đạt; camera thật và build web còn phải xác minh.
