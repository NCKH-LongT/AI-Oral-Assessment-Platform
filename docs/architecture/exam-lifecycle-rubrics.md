# Rubric riêng theo câu hỏi và vòng đời kỳ thi

## Tạo và duyệt

Trong luồng Điều phối kỳ thi, AI tạo rubric riêng cho mỗi câu từ câu hỏi, LO, tài liệu trong phạm vi môn/chủ đề và rubric định hướng của đề. Mỗi tiêu chí có tên, mô tả mức đầy đủ/một phần/không đạt, điểm tối đa và trọng số. Không tự yêu cầu so sánh/phân tích khi câu hỏi chỉ yêu cầu mô tả. Tiêu chí phát âm đã chọn được giữ nguyên và chấm từ audio bằng GOPT, không để LLM suy ra từ transcript.

Đề nhập sẵn giữ rubric đã nhập làm mặc định, mỗi câu có bản riêng. Giảng viên có thể sửa hoặc chủ động xin **Gợi ý rubric AI cho câu**. Với đề demo, chỉ sao chép mẫu và hiển thị thông báo demo, không giả là đã gọi AI thật. AI không được tự thay rubric của đề đã công bố hoặc tạo rubric mới theo từng sinh viên.

UI cho thêm/xóa tiêu chí (1–20), sửa mô tả, điểm/trọng số. Lưu bản nháp trước khi duyệt; nút duyệt bị khóa khi còn thay đổi chưa lưu hoặc đang gợi ý. Khi sửa câu hỏi, giảng viên phải kiểm tra lại rubric. Backend kiểm tra tên duy nhất trong mỗi câu, giá trị dương hữu hạn, giới hạn trường và phạm vi nguồn tài liệu.

## Lưu và chấm

Rubric của câu nằm trong `snapshot.questions[].criteria`, sao chép vào `Attempt.question` khi tạo phiên. Worker và luồng chấm lại dùng rubric của chính câu đó; GOPT dùng cùng bộ tiêu chí để tổng hợp điểm. Điểm câu chuẩn hóa về 0–10 theo trọng số như trước; điểm toàn bài là trung bình các câu hợp lệ. Kết quả lưu `rubric_scope` và `rubric_sha256` để đối chiếu tiêu chí đã dùng.

Đề/lần thi cũ không có criteria theo câu tiếp tục đọc `snapshot.criteria` đã đóng băng. Tiêu chí riêng rỗng/sai không âm thầm rơi về rubric chung. Lưu từ UI cũ không gửi trường criteria sẽ giữ rubric riêng đã có. Trường rich_content có thể gửi null để xóa minh họa, không bị bỏ qua cùng các trường tùy chọn khác.

Chấm lại theo phiên bản khác chỉ chấp nhận cùng nội dung câu, thời lượng và rubric hiệu lực của câu. Có thể đối chiếu bản cũ dùng rubric chung với bản mới có bản riêng tương đương. Thay rubric thực tế sẽ bị từ chối; chỉ đổi template chung không dùng cho câu đó không làm sai kết quả. Đề đã đóng vẫn là đề đã duyệt và có thể làm nguồn chấm lại.

## API

- `POST /admin/exams/{id}/questions/{position}/rubric-preview`: position bắt đầu từ 1; body là nội dung câu đang review. Chỉ giảng viên/admin có quyền sửa môn, chỉ GENERATED. Kiểm tra cấu hình model và nguồn tài liệu. Trả tiêu chí gợi ý, không đổi snapshot; chỉ ghi audit việc yêu cầu gợi ý. Lưu qua PUT draft khi đã review.
- `PUT /admin/exams/{id}/draft`: lưu câu và criteria riêng; từ TEACHER_APPROVED trở đi không cho sửa.
- `POST /admin/exams/{id}/close` và `/reopen`: admin/khảo thí; trạng thái PUBLISHED ↔ CLOSED. Snapshot không đổi, người đang thi vẫn làm tiếp. Endpoint bắt đầu khóa cùng hàng Exam với thao tác đóng để tuần tự hóa trên PostgreSQL.

Không cần migration schema: snapshot là JSON, trạng thái Exam là chuỗi hiện có. Không cập nhật hàng loạt rubric của các bài đã thi.

## Công cụ thử audio

- [GOPT Lab](../../tools/gopt-lab/README.md): gọi service thật, so sánh cả câu/từng clip và thay transcript. JSON/CSV giữ điểm hợp lệ hoặc lỗi, không ghi điểm 0 giả. Kiểm thử HTTP adapter không phải bằng chứng chất lượng acoustic.
- [HuBERT Lab](../../tools/hubert-lab/README.md): encoder CPU đã pin checkpoint, có FFmpeg đóng gói, báo cáo hash/phiên bản/layer. Đã chạy model thật trên lời nói và offline. Cosine là độ tương đồng, chưa phải scoring head; không thay GOPT và không cộng vào điểm thi.

Cần dữ liệu phát âm có nhãn giáo viên và tập đánh giá tách người nói để so sánh chất lượng hoặc đưa HuBERT vào chấm điểm thật.

## Kiểm chứng bản hoàn thiện — 05/11/2026

- API toàn bộ: **249 passed, 11 skipped** trên Windows. Các ca cần PostgreSQL/điều kiện môi trường vẫn được bỏ qua có điều kiện; kiểm tra bit quyền POSIX chỉ chạy trên POSIX, không coi Windows stat là kiểm chứng ACL.
- UI tổng hợp: **11 passed** (đóng/mở, gợi ý/sửa rubric từng câu và lưu trước duyệt, điều phối cũ, camera thật, phục hồi mạng, quota và upload chậm).
- Service GOPT: **18 passed** cho engine/HTTP không tải model. GOPT Lab được kiểm tra multipart, lỗi theo mẫu, schema điểm và CSV bằng HTTP fixture; chưa chạy container Kaldi acoustic trong lần kiểm chứng này.
- Audio labs: **12 passed**, có ca suy luận checkpoint HuBERT thật từ cache; đã chạy thêm lời nói 10,435 giây và biến thể tốc độ, không chỉ tensor giả.
- API client/hình học/timeout: **11 passed**. TypeScript, Ruff, ESLint phần thay đổi và build production đều đạt.

Các file model, cache, audio thử, dữ liệu bài nói, file cài đặt và tài liệu PDF cá nhân không đưa vào commit. HuBERT Lab vẫn là công cụ nghiên cứu đặc trưng, chưa dùng tính điểm thi; hiệu quả chấm phát âm cần bộ dữ liệu có nhãn và scoring head được kiểm chứng.
