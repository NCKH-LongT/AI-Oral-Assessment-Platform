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

## Kết quả kiểm chứng bổ sung — 04/11/2026

- Nhánh đã push lên fork coco-doit6879: codex/exam-resilience-proctoring.
- Build production đạt; worker tải model thật trong Edge headless và trả ready=false với ảnh trống.
- 6 kiểm thử hình học mặt/mắt đạt. Chưa hiệu chuẩn ngưỡng trên người/camera thật.
- 2 kiểm thử IndexedDB trên Edge đạt: lưu media/payload qua reload, phân tách session/backend; ghép phần audio theo thứ tự và xóa phần đã xử lý.
- Đã lưu từng đoạn MediaRecorder vào IndexedDB trong lúc ghi; phục hồi bản chưa có payload vào câu trả lời hiện tại. Mất phần chưa được phát sinh hoặc chưa commit vẫn có thể xảy ra. Khả năng phát lại container audio bị cắt cuối cần kiểm tra bằng audio thật.
- API recovery/upload: 6 passed, 1 skipped. Kiểm tra replay submit cùng khóa và complete upload không tạo trùng, đổi nội dung đã nộp bị 409.
- 30 client ASGI đồng thời, SQLite file test riêng: 30/30 đạt, p50 toàn luồng 2624,5 ms, p95 2843,0 ms. Luồng login/list/create/replay/read. Không bao gồm socket, upload hay AI. Đây không phải cam kết tải production. PostgreSQL/Docker chưa chạy trong môi trường hiện tại.
- Còn phải kiểm thử mất mạng xuyên suốt UI, audio thật phục hồi sau crash và upload đồng thời; cần điều chỉnh/tối ưu dựa trên kết quả đó trước triển khai.

### Mở rộng kiểm chứng upload và audio

- 30 client ASGI đồng thời với bắt đầu phiên/câu, upload audio WebM mẫu nhỏ và nộp: 30/30 đạt; p50 toàn luồng 7023,5 ms, p95 7453,0 ms. SQLite file; chưa đo băng thông hay AI.
- Edge ghi WebM từ Web Audio oscillator, lưu nhiều đoạn vào IndexedDB, reload và decodeAudioData audio ghép lại: đạt. Đây là bản ghi kết thúc bình thường; chưa mô phỏng cắt/crash trước đoạn cuối.
- 2 kiểm thử mediaRequest đạt: request treo bị abort và hiển thị hướng dẫn khôi phục, lỗi 409 giữ nguyên không tự retry.
- Media request giới hạn 120 giây, auth refresh 15 giây. Timeout không khẳng định server chưa commit; replay dùng khóa ban đầu.

### Kiểm thử UI và bản ghi bị ngắt

- Playwright/Edge trên web dev: ghi audio, API submit trả 503, reload, mở lại phiên, khôi phục backup, tải lại: đạt. Mọi lần submit dùng cùng idempotency key và chỉ có một payload được backend giả lập nhận thành công. Đây là UI thật với API được mock, chưa phải Wi-Fi thật + backend production.
- Edge ghi WebM rồi reload khi MediaRecorder vẫn đang chạy, không gọi stop: các chunk đã commit phục hồi và decodeAudioData thành công. Chưa khẳng định khôi phục phần cuối chưa commit hoặc tất cả định dạng trình duyệt.
- Camera bỏ qua frame có currentTime trùng để không duy trì trạng thái đạt từ video bị đứng; kết quả gắn stream ID để đổi camera phải đo lại.

### Model thật với ảnh có mặt

Đã chạy tools/vision-smoke.mjs qua Edge với worker từ production build và model/WASM thật. Ảnh mẫu công khai MediaPipe: https://storage.googleapis.com/mediapipe-assets/portrait.jpg (chỉ tải vào .data, không commit ảnh). Kết quả: ảnh trống từ chối; chân dung toàn thân đo mặt 5,6% và chưa đạt ngưỡng; mặt được crop/đặt giữa khung đo 9,9% và ready=true; ảnh thu nhỏ 10% bị từ chối. Có tín hiệu iris/openness ở ảnh có mặt. Đây không phải thử liveness hoặc xác thực danh tính.

Tái lập: build web; chạy web production local; tải ảnh nguồn vào .data/mediapipe-portrait.jpg; đặt VISION_BASE_URL tới web local, TEST_BROWSER_CHANNEL=msedge rồi chạy `node tools/vision-smoke.mjs`. Script tự tìm worker bundle trong .next/static/chunks, không cố định hash chunk.

Job upload đã giữ nguyên sessionId/backend lúc tạo; đổi backend sẽ không gửi bản ghi của server trước sang server mới. Cần tiếp tục kiểm thử các trường hợp điều hướng giữa nhiều phiên trên cùng thiết bị.

### Kho lưu cục bộ không khả dụng

Ba kiểm thử UI trên Edge đạt: API 503, request abort internetdisconnected, và IndexedDB.open ném QuotaExceededError. Hai trường hợp mạng khôi phục bằng cùng idempotency key sau reload; trường hợp quota vẫn upload online và hiển thị cảnh báo không bảo đảm phục hồi. DB xử lý onblocked/onversionchange để nâng cấp giữa các tab không chờ vô hạn. Hướng dẫn người dùng ở docs/exam-camera-network-guide.md.

## Đối chiếu yêu cầu trên nhánh — 05/11/2026

| Yêu cầu | Cài đặt và bằng chứng |
| --- | --- |
| Nghiên cứu tracking mắt | MediaPipe iris/eye landmarks, hiệu chuẩn 12 mẫu, hướng mắt ngang tương đối, cảnh báo lệch kéo dài. Unit tests eye-position và worker thật có tín hiệu mắt; chưa phải đo độ chính xác gaze theo tọa độ màn hình. Không tự quy kết gian lận. |
| Mặt chiếm bao nhiêu % và chưa đủ không vào thi | Bounding box 6–55%, một mặt, giữa ảnh, không bị cắt; sáu mẫu ổn định. Face-gate UI test dùng model thật kiểm tra ảnh trống bị khóa, mặt đúng khung được mở, video dừng bị khóa lại. |
| 30 người vào một lần | 30 ASGI client độc lập đạt cả login/list/create/replay/read/start/upload audio mẫu/submit; p50 7,02 s, p95 7,45 s. Có probe HTTP để đo deployment, chưa cam kết tải production hoặc 30 model AI song song. |
| Mất Wi-Fi khi đang làm | Lưu audio từng đoạn vào IndexedDB, payload/khóa nộp giữ nguyên, khôi phục theo session/backend. UI test abort internetdisconnected + reload + retry đạt. WebM bị ngắt trước stop đã decode sau khôi phục. |
| Mạng yếu | Request media tối đa 120s, auth refresh 15s, một lớp retry có jitter, checksum từng đoạn. Slow-upload UI test mô phỏng 300ms/đoạn và mất phản hồi đầu: bytes/checksum khi retry không đổi, upload hoàn tất. |
| Thay đổi trên web và nhánh fork riêng | Tích hợp vào Student; nhánh codex/exam-resilience-proctoring trên coco-doit6879/AI-Oral-Assessment-Platform; chưa merge/deploy production. |

Lần chạy tổng hợp cuối: 5 UI tests đạt (face-gate, hai dạng lỗi mạng, quota, slow-upload); 11 unit/API client tests đạt; TypeScript đạt. Lưu cục bộ là hỗ trợ phục hồi, không thay thế xác nhận server. Chưa xác minh camera thật nhiều người/điều kiện ánh sáng, tốc độ WAN hoặc cấu hình production. Hướng dẫn vận hành đã nêu các giới hạn này; không gán các kết quả local thành bảo đảm production.

### Kiểm chứng cuối trên bản mã đã commit

Commit b55974b được xuất riêng bằng git archive, không chứa các sửa đổi ngoài phạm vi chưa commit. Build production từ bản xuất đạt. Backend trên bản xuất: 7 passed, 1 skipped (ca khóa đồng thời cần PostgreSQL); 30/30 client đạt, p50 6773 ms, p95 7187 ms cho toàn luồng đã nêu. Code ứng dụng đã qua lint phần thay đổi và TypeScript; 5 UI tests và 11 unit/API client tests đạt. Kho audio đã có 4 kiểm thử Edge độc lập đạt. Nhánh này là kết quả nghiên cứu/thử nghiệm để review; không chứa thay đổi rubric/đóng mở đề đang làm ở phần việc khác và chưa merge hay deploy production.
