# Business Rules

## 1. Giới thiệu

Tài liệu này ghi lại các quy tắc nghiệp vụ của hệ thống AI Oral Assessment Platform.

---

## 2. Quy tắc về Môn học

### 2.1 Tạo và quản lý môn học

| BR-ID | Quy tắc | Lý do |
|-------|---------|-------|
| **BR-001** | Mỗi môn học phải có mã duy nhất | Tránh trùng lặp và xung đột |
| **BR-002** | Mã môn học không được thay đổi sau khi tạo | Đảm bảo tính nhất quán với hệ thống khác |
| **BR-003** | Môn học có thể ở trạng thái: ACTIVE, ARCHIVED | Hỗ trợ lưu trữ mà không xóa dữ liệu |
| **BR-004** | Môn học đã lưu trữ có thể khôi phục | Cho phép mở lại môn nếu cần |

### 2.2 Xóa môn học

**Narrative:** Khi xóa một môn học, hệ thống sẽ xóa vĩnh viễn toàn bộ dữ liệu liên quan bao gồm: tài liệu, chủ đề, LO, rubric, đề thi, enrollment, lượt thi, kết quả và bản ghi. Thao tác này không thể hoàn tác.

| BR-ID | Quy tắc | Lý do |
|-------|---------|-------|
| **BR-005** | Xóa môn học yêu cầu nhập đúng mã môn để xác nhận | Ngăn chặn xóa nhầm |
| **BR-006** | Tài khoản người dùng không bị xóa khi xóa môn | Giữ nguyên hệ thống tài khoản |
| **BR-007** | Nếu môn đang được xử lý, phải chờ hoàn tất trước khi xóa | Đảm bảo tính nhất quán dữ liệu |
| **BR-008** | Giảng viên chỉ xóa được môn trống do mình quản lý | Bảo vệ dữ liệu của giảng viên khác |

---

## 3. Quy tắc về Tài liệu và Kiến thức

### 3.1 Upload tài liệu

| BR-ID | Quy tắc | Lý do |
|-------|---------|-------|
| **BR-009** | Chỉ chấp nhận file PDF cho giáo trình | Đảm bảo định dạng nhất quán cho xử lý |
| **BR-010** | Mỗi môn chỉ có một giáo trình chính (TEXTBOOK) | Tránh xung đột nội dung |
| **BR-011** | Có thể upload nhiều tài liệu bổ sung (SUPPLEMENT) | Hỗ trợ tài liệu tham khảo |
| **BR-012** | Tài liệu phải ở trạng thái READY trước khi tạo đề | Đảm bảo nội dung đã được xử lý đầy đủ |

### 3.2 Xử lý tài liệu

**Narrative:** Khi upload giáo trình, hệ thống sẽ:
1. Upload file lên object storage
2. Extract text từ PDF
3. Tách thành chunks theo heading/page
4. Tạo embedding cho mỗi chunk bằng embedding model
5. Lưu chunks vào pgvector database

| BR-ID | Quy tắc | Lý do |
|-------|---------|-------|
| **BR-013** | Chunks phải được gắn metadata: course_id, topic_id, LO, page, heading | Để truy xuất chính xác khi chấm điểm |
| **BR-014** | Embedding model phải khớp khi tạo và truy xuất | Đảm bảo vector search hoạt động đúng |
| **BR-015** | Nếu đổi embedding model, phải xử lý lại tài liệu và công bố đề mới | Vì vector space khác nhau giữa các model |

---

## 4. Quy tắc về Rubric

| BR-ID | Quy tắc | Lý do |
|-------|---------|-------|
| **BR-016** | Rubric có thể có nhiều phiên bản (version) | Hỗ trợ thay đổi tiêu chí theo thời gian |
| **BR-017** | Rubric đang được sử dụng bởi đề đã công bố không thể xóa | Bảo toàn đề thi đã tạo |
| **BR-018** | Mỗi criterion phải có: tên, mô tả, điểm tối đa, trọng số | Đảm bảo đầy đủ thông tin đánh giá |
| **BR-019** | Trọng số các criterion không bắt buộc phải bằng 100% | Cho phép linh hoạt thiết kế rubric |

---

## 5. Quy tắc về Đề thi

### 5.1 Tạo và công bố đề

| BR-ID | Quy tắc | Lý do |
|-------|---------|-------|
| **BR-020** | Đề thi có trạng thái: DRAFT → PUBLISHED → ARCHIVED | Quản lý vòng đời đề thi |
| **BR-021** | Chỉ đề ở trạng thái DRAFT mới có thể chỉnh sửa | Bảo toàn đề đã công bố |
| **BR-022** | Đề đã công bố không thể xóa, chỉ có thể archive | Giữ lịch sử kỳ thi |
| **BR-023** | Đề công bố sẽ tạo ExamSnapshot để freeze rubric/knowledge versions | Đảm bảo đề không thay đổi trong kỳ thi |

### 5.2 Exam Blueprint

**Narrative:** Blueprint định nghĩa cách phân bổ câu hỏi cho đề thi. Mỗi mục trong blueprint gồm: topic, difficulty, số lượng câu hỏi. AI sẽ sinh câu hỏi theo blueprint này.

| BR-ID | Quy tắc | Lý do |
|-------|---------|-------|
| **BR-024** | Blueprint phải chỉ định rõ topic và difficulty cho mỗi nhóm câu hỏi | Kiểm soát độ khó và nội dung |
| **BR-025** | Tổng số câu hỏi phải khớp với blueprint | Đảm bảo đề đầy đủ |
| **BR-026** | Difficulty có 3 mức: easy, medium, hard | Phân loại độ khó nhất quán |

### 5.3 Gợi ý thuật ngữ tiếng Anh

| BR-ID | Quy tắc | Lý do |
|-------|---------|-------|
| **BR-027** | Khi sinh đề, AI gợi ý thuật ngữ tiếng Anh cho từng câu hỏi | Hỗ trợ giảng viên kiểm tra |
| **BR-028** | Mỗi câu hỏi có tối đa 20 gợi ý thuật ngữ | Tránh quá tải thông tin |
| **BR-029** | Gợi ý chỉ là tham khảo, không tự thêm vào PhoWhisper | Giảng viên cần xác nhận thủ công |
| **BR-030** | Gợi ý được lưu cùng phiên bản đề, đề cũ không tự sinh lại | Bảo toàn tính nhất quán |

---

## 6. Quy tắc về Sinh viên và Thi

### 6.1 Enrollment

| BR-ID | Quy tắc | Lý do |
|-------|---------|-------|
| **BR-031** | Chỉ sinh viên trong danh sách enrollment mới được thi | Đảm bảo chỉ người đủ điều kiện |
| **BR-032** | Sinh viên có thể xem đề công bố trong tương lai sau khi được thêm vào môn | Chuẩn bị trước cho kỳ thi |
| **BR-033** | Bỏ khỏi môn không xóa lịch sử thi hoặc đề đã giao riêng | Giữ bằng chứng thi cũ |

### 6.2 Số lần làm bài

| BR-ID | Quy tắc | Lý do |
|-------|---------|-------|
| **BR-034** | Mỗi đề thi có cấu hình số lần làm: không cho làm lại / cho thêm N lần / không giới hạn | Linh hoạt theo yêu cầu kỳ thi |
| **BR-035** | "Cho thêm N lần" nghĩa là tổng cộng N+1 lượt | Định nghĩa rõ ràng |
| **BR-036** | Admin có thể cấp thêm lượt riêng cho từng sinh viên | Xử lý trường hợp đặc biệt |
| **BR-037** | Xóa một lần thi không ảnh hưởng đến lượt còn lại | Độc lập giữa các lần |

---

## 7. Quy tắc về Chấm điểm

### 7.1 AI Grading

**Narrative:** Khi sinh viên nộp bài, server sẽ chấm điểm bằng AI theo luồng:
1. Lấy câu hỏi + transcript + rubric + RAG evidence
2. Gửi cho LLM với prompt định nghĩa sẵn
3. LLM trả về structured JSON với điểm và feedback
4. Server lưu kết quả

| BR-ID | Quy tắc | Lý do |
|-------|---------|-------|
| **BR-038** | AI phải trả về structured JSON theo schema định nghĩa | Đảm bảo parse được kết quả |
| **BR-039** | AI phải báo confidence score cùng với điểm | Đánh giá độ tin cậy |
| **BR-040** | Điểm phải nằm trong khoảng 0 đến điểm tối đa của criterion | Không vượt quá thang điểm |

### 7.2 Confidence Gate

| BR-ID | Quy tắc | Lý do |
|-------|---------|-------|
| **BR-041** | Nếu confidence ≥ threshold (mặc định 0.85) → auto accept điểm | Giảm tải cho giảng viên |
| **BR-042** | Nếu confidence < threshold → yêu cầu giảng viên duyệt | Đảm bảo điểm đáng tin cậy |
| **BR-043** | Threshold có thể cấu hình được | Linh hoạt theo yêu cầu |
| **BR-044** | Điểm từ demo mode không có confidence, hiển thị "Chưa có độ tin cậy AI" | Tránh nhầm lẫn với điểm thật |

### 7.3 Review và Override

**Narrative:** Giảng viên có thể xem lại kết quả AI và thực hiện các thao tác:
- **Chấm lại:** Sửa transcript và yêu cầu AI chấm lại
- **Override:** Điều chỉnh điểm thủ công (có log)

| BR-ID | Quy tắc | Lý do |
|-------|---------|-------|
| **BR-045** | Mọi thao tác chấm lại/override đều được log với lý do | Audit trail |
| **BR-046** | Chấm lại lưu lịch sử đầy đủ | Có thể rollback nếu cần |
| **BR-047** | Override điểm yêu cầu nhập lý do bắt buộc | Trách nhiệm giải trình |
| **BR-048** | Sau khi override, kết quả cần được duyệt lại | Đảm bảo quy trình đúng |

---

## 8. Quy tắc về Giao đề

| BR-ID | Quy tắc | Lý do |
|-------|---------|-------|
| **BR-049** | Admin giao đề cho giảng viên phụ trách bộ môn | Phân quyền rõ ràng |
| **BR-050** | Giảng viên có thể xem đề trước khi sinh viên thấy | Kiểm tra trước khi công bố |
| **BR-051** | Đề có thể giao cho toàn môn hoặc giao riêng cho từng sinh viên | Linh hoạt theo nhu cầu |
| **BR-052** | Sinh viên bấm "Làm mới bài thi" nếu danh sách chưa cập nhật | Xử lý cache |

---

## 9. Quy tắc về Ngân hàng câu hỏi

| BR-ID | Quy tắc | Lý do |
|-------|---------|-------|
| **BR-053** | Câu hỏi tạo từ mỗi lần ra đề được tự động đưa vào ngân hàng câu hỏi chung | Tái sử dụng câu hỏi |
| **BR-054** | Giảng viên có thể đánh dấu câu hỏi yêu thích | Ưu tiên sử dụng lại |
| **BR-055** | Câu hỏi trong ngân hàng có thể filter theo topic, difficulty, ngày tạo | Dễ tìm kiếm |

---

## 10. Quy tắc về Thời gian

| BR-ID | Quy tắc | Lý do |
|-------|---------|-------|
| **BR-056** | Mỗi đề thi có thời gian làm bài (time_limit) được định nghĩa khi tạo | Quản lý thời gian thi |
| **BR-057** | Quá thời gian → hệ thống tự động nộp bài | Đảm bảo công bằng |
| **BR-058** | Thời gian được tính phía server, không tin tưởng client | Chống gian lận |

---

## 11. Quy tắc về Thiết bị & Tiền xử lý Âm thanh

**Narrative:** Trước khi vào thi, sinh viên phải qua bước kiểm tra micro và độ ồn môi trường trong 10 giây. Hệ thống hỗ trợ điều chỉnh độ lợi (gain) âm thanh đầu vào để tối ưu chất lượng ghi âm mà không làm sai lệch kết quả đo tiếng ồn môi trường.

| BR-ID | Quy tắc | Lý do |
|-------|---------|-------|
| **BR-059** | Ghi thử 10 giây trước thi: 3 giây đầu giữ im lặng để đo tạp âm nền, 7 giây sau nói thử để kiểm tra micro | Đánh giá chính xác điều kiện âm thanh trước khi vào phòng thi |
| **BR-060** | Báo phòng quá ồn nếu $\ge 20\%$ cửa sổ trong 3s đầu $\ge -40\text{ dBFS}$; báo mic hỏng nếu 10s không có tín hiệu $\ge -90\text{ dBFS}$ | Tránh sinh viên thi trong môi trường quá ồn làm hỏng kết quả STT |
| **BR-061** | Dữ liệu kiểm tra mic 10s chỉ lưu tạm trong bộ nhớ máy học viên; tuyệt đối không upload lên server | Bảo vệ quyền riêng tư và tránh tốn băng thông hệ thống |
| **BR-062** | Hỗ trợ thanh Gain điều chỉnh âm lượng từ $-12\text{ dB}$ đến $+18\text{ dB}$ (mặc định 0); phép đo tiếng ồn nền luôn lấy tín hiệu trước Gain | Tối ưu âm lượng giọng nói mà không làm thay đổi kết luận tiếng ồn nền |
| **BR-063** | Hiển thị cảnh báo hạ Gain khi âm lượng sau gain tiệm cận hoặc vượt $-1\text{ dBFS}$; khóa thanh Gain khi đang ghi âm/STT/nộp bài | Chống hiện tượng vỡ tiếng (audio clipping) và đảm bảo ổn định luồng ghi |

---

## 12. Quy tắc về Đối soát Transcript & Chống Gian lận

**Narrative:** Sau khi hoàn thành câu trả lời, sinh viên nghe lại audio và kiểm tra transcript. Hệ thống gỡ bỏ mô hình LLM local nặng nề, cho phép sinh viên sửa tay hoặc thử nhận dạng lại, đồng thời kích hoạt cờ giám sát trung thực.

| BR-ID | Quy tắc | Lý do |
|-------|---------|-------|
| **BR-064** | Gỡ bỏ hoàn toàn sửa lỗi LLM cục bộ (Qwen3); sinh viên tự đối soát transcript sau khi STT xong | Giảm tải tài nguyên máy trạm của sinh viên, tránh lag giật khi thi |
| **BR-065** | Sinh viên được chọn giữa bản ghi gốc và bản lọc nhiễu RNNoise để bấm "Thử STT lại"; file lưu trữ minh chứng luôn là bản gốc | Hỗ trợ sinh viên thử lại khi có tạp âm nhưng vẫn bảo toàn chứng cứ gốc |
| **BR-066** | Nếu sinh viên sửa tay transcript khác bản STT gốc $\rightarrow$ Hệ thống gán `stt_confidence = 0` và tự động bật `review_required = True` | Bắt buộc Giảng viên phải nghe lại audio đối soát, ngăn gian lận nói một đằng gõ một nẻo |
| **BR-067** | Khi bài thi đang `IN_PROGRESS`, Desktop (Electron `will-prevent-unload`) và Web (`beforeunload`) chặn thoát đột ngột bằng hộp thoại Unload Guard | Ngăn sinh viên vô tình reload hoặc tắt app làm mất bài thi chưa nộp |

---

## 13. Quy tắc về Kích hoạt Thẩm định & Giới hạn Rubric

| BR-ID | Quy tắc | Lý do |
|-------|---------|-------|
| **BR-068** | Kích hoạt `review_required = True` khi: AI confidence < threshold, STT confidence < threshold, hoặc điểm câu ngấp nghé ranh giới Đậu/Rớt ($|Score - 5| \le 0.25$) | Đảm bảo tính công bằng và chính xác cho các trường hợp ranh giới 5.0 điểm FPT |
| **BR-069** | Backend kiểm tra trần điểm từng tiêu chí ($\le \text{max\_score}$); AI trả quá trần điểm sẽ bị từ chối kết quả (`AI_OUTPUT_INVALID`) | Không tin tưởng mù quáng vào AI, bảo đảm tính toàn vẹn của rubric |

---

## 14. Quy tắc về Xóa Môn học An toàn & Hàng đợi MinIO

| BR-ID | Quy tắc | Lý do |
|-------|---------|-------|
| **BR-070** | Xóa môn học thực hiện khóa dòng `with_for_update(nowait=True)`; nếu worker đang chấm bài dính lock trả HTTP 409 `COURSE_BUSY` | Tránh deadlock và xung đột dữ liệu giữa quản trị viên và background worker |
| **BR-071** | Đưa toàn bộ file media cần xóa (`document.storage_key` và `upload.storage_key`) vào bảng `MediaCleanup` để worker dọn sạch trên MinIO S3 sau commit | Dọn sạch triệt để dung lượng lưu trữ, tránh rác storage |

---

## 15. Bảng tổng hợp Business Rules

| BR-ID | Phạm vi | Tóm tắt |
|-------|---------|---------|
| BR-001 | Môn học | Mã môn duy nhất |
| BR-002 | Môn học | Mã môn không đổi |
| BR-003 | Môn học | Trạng thái ACTIVE/ARCHIVED |
| BR-004 | Môn học | Có thể khôi phục |
| BR-005 | Xóa môn | Nhập mã xác nhận |
| BR-006 | Xóa môn | Không xóa tài khoản |
| BR-007 | Xóa môn | Chờ xử lý xong |
| BR-008 | Xóa môn | Giảng viên chỉ xóa môn trống của mình |
| BR-009 | Tài liệu | Chỉ chấp nhận PDF |
| BR-010 | Tài liệu | Một TEXTBOOK/môn |
| BR-011 | Tài liệu | Nhiều SUPPLEMENT được |
| BR-012 | Tài liệu | Phải READY mới tạo đề |
| BR-013 | Tài liệu | Chunks có metadata đầy đủ |
| BR-014 | Tài liệu | Embedding model phải khớp |
| BR-015 | Tài liệu | Đổi model → xử lý lại |
| BR-016 | Rubric | Có phiên bản |
| BR-017 | Rubric | Đang dùng thì không xóa |
| BR-018 | Rubric | Criterion có đầy đủ thông tin |
| BR-019 | Rubric | Trọng số không bắt buộc 100% |
| BR-020 | Đề thi | Trạng thái DRAFT/PUBLISHED/ARCHIVED |
| BR-021 | Đề thi | DRAFT mới chỉnh sửa |
| BR-022 | Đề thi | PUBLISHED không xóa, chỉ archive |
| BR-023 | Đề thi | PUBLISHED tạo snapshot |
| BR-024 | Đề thi | Blueprint chỉ rõ topic/difficulty |
| BR-025 | Đề thi | Tổng số câu khớp blueprint |
| BR-026 | Đề thi | 3 mức difficulty |
| BR-027 | Đề thi | Gợi ý thuật ngữ khi sinh đề |
| BR-028 | Đề thi | Tối đa 20 thuật ngữ/câu |
| BR-029 | Đề thi | Gợi ý không tự thêm vào STT |
| BR-030 | Đề thi | Gợi ý lưu cùng phiên bản đề |
| BR-031 | Enrollment | Chỉ người trong danh sách mới thi |
| BR-032 | Enrollment | Xem đề tương lai sau khi thêm |
| BR-033 | Enrollment | Bỏ khỏi môn không xóa lịch sử |
| BR-034 | Số lần thi | 3 cấu hình: không/giới hạn/không giới hạn |
| BR-035 | Số lần thi | N+1 lượt khi cho thêm N lần |
| BR-036 | Số lần thi | Admin cấp thêm riêng |
| BR-037 | Số lần thi | Xóa lần này không ảnh hưởng lần khác |
| BR-038 | Chấm điểm | AI trả JSON đúng schema |
| BR-039 | Chấm điểm | AI báo confidence |
| BR-040 | Chấm điểm | Điểm trong khoảng cho phép |
| BR-041 | Chấm điểm | Confidence cao → auto accept |
| BR-042 | Chấm điểm | Confidence thấp → cần duyệt |
| BR-043 | Chấm điểm | Threshold cấu hình được |
| BR-044 | Chấm điểm | Demo mode không có confidence |
| BR-045 | Review | Mọi thao tác được log |
| BR-046 | Review | Chấm lại lưu lịch sử |
| BR-047 | Review | Override cần lý do |
| BR-048 | Review | Override cần duyệt lại |
| BR-049 | Giao đề | Admin giao cho giảng viên |
| BR-050 | Giao đề | Giảng viên xem trước sinh viên |
| BR-051 | Giao đề | Giao toàn môn hoặc riêng |
| BR-052 | Giao đề | Sinh viên refresh để cập nhật |
| BR-053 | Ngân hàng | Câu hỏi tự động vào ngân hàng |
| BR-054 | Ngân hàng | Đánh dấu yêu thích |
| BR-055 | Ngân hàng | Filter được |
| BR-056 | Thời gian | Có time_limit |
| BR-057 | Thời gian | Quá hạn tự nộp |
| BR-058 | Thời gian | Server tính thời gian |
| BR-059 | Thiết bị | Noise check 10 giây (3s im lặng, 7s nói) |
| BR-060 | Thiết bị | Ngưỡng ồn -40dBFS & ngưỡng mic hỏng -90dBFS |
| BR-061 | Thiết bị | Đo tiếng ồn luôn lấy tín hiệu trước Gain |
| BR-062 | Thiết bị | Cảnh báo hạ Gain khi vượt -1dBFS (chống vỡ tiếng) |
| BR-063 | Thiết bị | Khóa thanh Gain và chọn mic khi đang thi |
| BR-064 | Transcript | Gỡ bỏ LLM local Qwen3 sửa chính tả |
| BR-065 | Transcript | Chọn bản gốc hoặc RNNoise để thử STT lại |
| BR-066 | Chống gian lận | Sửa transcript $\rightarrow$ gán confidence=0 $\rightarrow$ kích hoạt review |
| BR-067 | Phòng thi | Unload Guard chặn đóng app/reload khi đang thi |
| BR-068 | Thẩm định | Review khi confidence thấp hoặc điểm ngấp nghé 5.0 |
| BR-069 | Rubric | Backend kiểm tra trần điểm criterion |
| BR-070 | Xóa môn | Khóa NOWAIT, dính worker trả 409 COURSE_BUSY |
| BR-071 | Xóa môn | Hàng đợi MediaCleanup dọn sạch rác MinIO sau commit |

