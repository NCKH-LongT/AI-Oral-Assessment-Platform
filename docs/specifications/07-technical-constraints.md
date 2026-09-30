# Technical Constraints

## 1. Giới thiệu

Tài liệu này ghi lại các ràng buộc kỹ thuật và nguyên tắc kiến trúc của hệ thống AI Oral Assessment Platform.

---

## 2. Nguyên tắc kiến trúc cốt lõi

### 2.1 Server là Source of Truth

**Narrative:** Điểm chính thức, trạng thái thi, và các quyết định quan trọng phải được tính và lưu ở server. Desktop client chỉ gửi dữ liệu lên server, không tự quyết định điểm số.

| TC-ID | Ràng buộc | Lý do |
|-------|-----------|-------|
| **TC-001** | Điểm chính thức được tính và lưu ở server | Đảm bảo tính nhất quán |
| **TC-002** | Desktop chỉ gửi: transcript, metadata, media, hash, trạng thái | Không tin tưởng client cho dữ liệu quan trọng |
| **TC-003** | Server quyết định: câu hỏi, rubric version, điểm, trạng thái hoàn thành | Bảo mật và công bằng |
| **TC-004** | Không tin tưởng dữ liệu quan trọng từ desktop client | Client có thể bị manipulate |

### 2.2 Audio/Video là Evidence, không phải Input Chấm

**Narrative:** Audio và video chỉ được dùng làm bằng chứng (evidence) để sinh viên/khách hàng có thể kiểm tra, và để giảng viên review khi cần. Việc chấm điểm dựa trên transcript đã được xử lý.

| TC-ID | Ràng buộc | Lý do |
|-------|-----------|-------|
| **TC-005** | Audio/video không dùng trực tiếp để chấm điểm | Tránh bias từ cảm xúc/khuôn mặt |
| **TC-006** | Chấm điểm dựa trên: question + transcript + rubric + RAG | Phương pháp đánh giá nhất quán |
| **TC-007** | Audio/video chỉ là evidence cho audit/appeal | Lưu trữ bằng chứng |
| **TC-008** | Không dùng facial expression làm tiêu chí chấm | Đạo đức và công bằng |

### 2.3 Chỉ Record Khi Sinh Viên Trả Lời

| TC-ID | Ràng buộc | Lý do |
|-------|-----------|-------|
| **TC-009** | Camera/mic được mở sẵn để kiểm tra và preview | Giảm delay khi bắt đầu |
| **TC-010** | MediaRecorder chỉ bắt đầu khi sinh viên bấm "Bắt đầu trả lời" | Bảo vệ quyền riêng tư |
| **TC-011** | Không ghi hình liên tục toàn bộ thời gian thi (mặc định) | Giảm dung lượng và lo ngại về quyền riêng tư |

---

## 3. Ràng buộc về STT (Speech-to-Text)

### 3.1 Desktop STT

**Narrative:** Desktop sử dụng PhoWhisper-small INT8 chạy local trên máy sinh viên. Không cần upload audio lên server để nhận dạng.

| TC-ID | Ràng buộc | Lý do |
|-------|-----------|-------|
| **TC-012** | Desktop bắt buộc đóng gói PhoWhisper-small INT8 + runtime | STT local không phụ thuộc server |
| **TC-013** | STT chạy local, không cần kết nối server để nhận dạng | Hỗ trợ mạng yếu |
| **TC-014** | Audio gốc được lưu riêng, không thay bằng bản đã lọc | Bảo toàn bằng chứng |
| **TC-015** | Có tùy chọn bật/tắt RNNoise cho audio STT | Linh hoạt theo điều kiện |

### 3.2 Server STT (Optional)

| TC-ID | Ràng buộc | Lý do |
|-------|-----------|-------|
| **TC-016** | Server STT chỉ dùng cho: trình duyệt web, nhận dạng lại | Desktop luôn dùng local |
| **TC-017** | Có thể chọn Gemini STT hoặc Google Cloud STT | Linh hoạt theo yêu cầu |
| **TC-018** | Google Cloud STT cần service account JSON | Xác thực với Google |

---

## 4. Ràng buộc về AI Grading

### 4.1 AI Provider

**Narrative:** Hệ thống hỗ trợ hai AI provider chính: Gemini (cloud) và Ollama (local). Cấu hình qua `.env` hoặc qua web admin.

| TC-ID | Ràng buộc | Lý do |
|-------|-----------|-------|
| **TC-019** | AI provider được cấu hình qua `AI_CONFIG_SOURCE`: env hoặc admin | Linh hoạt deployment |
| **TC-020** | Ollama phải hỗ trợ JSON schema output | Đảm bảo parse được kết quả |
| **TC-021** | Ollama embedding model phải 768 chiều | Tương thích với pgvector |

### 4.2 Grading Pipeline

| TC-ID | Ràng buộc | Lý do |
|-------|-----------|-------|
| **TC-022** | LLM phải trả structured JSON đúng schema | Parse và validate tự động |
| **TC-023** | LLM phải trả confidence score | Đánh giá độ tin cậy |
| **TC-024** | Không lưu chain-of-thought dài từ LLM | Bảo mật và hiệu suất |
| **TC-025** | Chỉ lưu reasoning summary ngắn cho audit | Đủ để kiểm tra, không quá tải |

### 4.3 RAG Grounding

**Narrative:** Việc chấm điểm phải dựa trên kiến thức được truy xuất từ RAG, không dùng general knowledge của LLM.

| TC-ID | Ràng buộc | Lý do |
|-------|-----------|-------|
| **TC-026** | Chấm điểm phải dùng RAG retrieval để ground câu trả lời | Đảm bảo đánh giá đúng ngữ cảnh |
| **TC-027** | Không dùng general knowledge của LLM để chấm | Tránh hallucination |
| **TC-028** | Retrieval phải filter theo: course, topic, LO | Chỉ lấy knowledge liên quan |
| **TC-029** | Top-K chunks được dùng cho grading | Cân bằng giữa context và cost |

---

## 5. Ràng buộc về Security

### 5.1 Electron Security

| TC-ID | Ràng buộc | Lý do |
|-------|-----------|-------|
| **TC-030** | `contextIsolation = true` | Bảo vệ context khỏi renderer |
| **TC-031** | `nodeIntegration = false` | Ngăn truy cập Node.js API |
| **TC-032** | `sandbox = true` | Hạn chế quyền renderer |
| **TC-033** | Dùng preload script với whitelist IPC | Kiểm soát giao tiếp |
| **TC-034** | Không expose `fs`, `child_process`, `shell` cho renderer | Bảo mật hệ thống |

### 5.2 API Security

| TC-ID | Ràng buộc | Lý do |
|-------|-----------|-------|
| **TC-035** | JWT authentication cho tất cả API | Xác thực người dùng |
| **TC-036** | Role-based access control (RBAC) | Phân quyền theo vai trò |
| **TC-037** | Rate limiting trên API | Chống abuse |
| **TC-038** | Audit logging cho tất cả action quan trọng | Theo dõi và điều tra |
| **TC-039** | Không expose secret trong response | Bảo mật |

### 5.3 Secrets Management

| TC-ID | Ràng buộc | Lý do |
|-------|-----------|-------|
| **TC-040** | API keys và secrets không được lưu trong Git | Bảo mật |
| **TC-041** | Credentials lưu trong `.env` (không commit) | Development practice |
| **TC-042** | Production dùng secret manager | Bảo mật production |
| **TC-043** | Không gửi API key xuống Electron | Bảo vệ credentials |

### 5.4 Local LLM Limitations

**Narrative:** Local LLM trên desktop không phải security boundary. Không nên gửi xuống desktop những thông tin nhạy cảm.

| TC-ID | Ràng buộc | Lý do |
|-------|-----------|-------|
| **TC-044** | Không gửi full rubric xuống desktop | Có thể bị reverse engineer |
| **TC-045** | Không gửi grading prompt xuống desktop | Bảo mật grading logic |
| **TC-046** | Không gửi answer key xuống desktop | Chống gian lận |
| **TC-047** | Local LLM chỉ dùng cho: fallback, offline, concept extraction | Hạn chế rủi ro |

---

## 6. Ràng buộc về Data Integrity

### 6.1 Media Upload

| TC-ID | Ràng buộc | Lý do |
|-------|-----------|-------|
| **TC-048** | Media upload dùng chunked upload | Hỗ trợ file lớn |
| **TC-049** | Mỗi chunk có SHA256 checksum | Kiểm tra toàn vẹn |
| **TC-050** | Hỗ trợ resumable upload | Xử lý mạng không ổn định |
| **TC-051** | Upload chạy background, không block UI | Trải nghiệm người dùng |
| **TC-052** | Upload chạy song song với việc trả lời câu tiếp theo | Tối ưu thời gian |

### 6.2 Evidence Integrity

| TC-ID | Ràng buộc | Lý do |
|-------|-----------|-------|
| **TC-053** | Mỗi evidence file có SHA256 checksum | Bảo toàn bằng chứng |
| **TC-054** | Server lưu checksum và verify | Đảm bảo không bị sửa đổi |
| **TC-055** | Có thể dùng chained hashes cho integrity cao hơn | Tùy chọn bảo mật |

### 6.3 Concurrency

| TC-ID | Ràng buộc | Lý do |
|-------|-----------|-------|
| **TC-056** | Không cho submit cùng một QuestionAttempt nhiều lần | Tránh duplicate |
| **TC-057** | Dùng transaction hoặc state validation | Đảm bảo atomicity |
| **TC-058** | Exam session có unique constraint: exam_id + student_id + status | Chỉ một session active |

---

## 7. Ràng buộc về Exam Snapshot

**Narrative:** Khi đề thi được công bố, hệ thống tạo ExamSnapshot để freeze tất cả các thành phần liên quan. Điều này đảm bảo đề không thay đổi trong suốt kỳ thi.

| TC-ID | Ràng buộc | Lý do |
|-------|-----------|-------|
| **TC-059** | PUBLISHED exam tạo snapshot freeze: rubric version, knowledge version | Đảm bảo đề không đổi |
| **TC-060** | Snapshot không được thay đổi sau khi student bắt đầu thi | Bảo toàn đề thi |
| **TC-061** | Đổi rubric/knowledge không ảnh hưởng exam đang active | Cô lập thay đổi |
| **TC-062** | Re-grade dùng snapshot của lần thi, không dùng version mới | Nhất quán kết quả |

---

## 8. Ràng buộc về Performance

### 8.1 Desktop Performance

| TC-ID | Ràng buộc | Lý do |
|-------|-----------|-------|
| **TC-063** | FFmpeg, STT nặng chạy trong worker thread hoặc child process | Không block UI |
| **TC-064** | Không chạy large file hashing/splitting trong renderer | Hiệu suất |
| **TC-065** | SQLite cache phải mã hóa nếu lưu dữ liệu nhạy cảm | Bảo mật local |

### 8.2 Server Performance

| TC-ID | Ràng buộc | Lý do |
|-------|-----------|-------|
| **TC-066** | AI requests không gửi toàn bộ PDF vào mỗi request | Tối ưu cost và latency |
| **TC-067** | Chỉ gửi top-K relevant chunks cho grading | Đủ context, không waste |
| **TC-068** | Batch document embedding khi có thể | Tối ưu API calls |
| **TC-069** | Cache embedding khi có thể | Giảm compute |

### 8.3 Idempotency

| TC-ID | Ràng buộc | Lý do |
|-------|-----------|-------|
| **TC-070** | Submit answer, finish exam, upload complete phải idempotent | An toàn khi retry |
| **TC-071** | Dùng Idempotency-Key header cho các request quan trọng | Tránh duplicate processing |

---

## 9. Ràng buộc về Error Handling

| TC-ID | Ràng buộc | Lý do |
|-------|-----------|-------|
| **TC-072** | Mọi API error trả format chuẩn: `{ error: { code, message, details } }` | Dễ xử lý client |
| **TC-073** | Không trả stack trace cho client | Bảo mật |
| **TC-074** | Crash recovery: app crash không mất bài đã trả lời | Độ tin cậy |
| **TC-075** | Network down: lưu local, tiếp tục khi có mạng | Khả dụng |

---

## 10. Ràng buộc về Cấu hình

| TC-ID | Ràng buộc | Lý do |
|-------|-----------|-------|
| **TC-076** | Không hardcode: LLM model, embedding model, chunk size, confidence threshold | Linh hoạt |
| **TC-077** | Mọi threshold và config phải configurable | Thích ứng nhu cầu |

---

## 11. Bảng tổng hợp Technical Constraints

| TC-ID | Phạm vi | Tóm tắt |
|-------|---------|---------|
| TC-001 | Server Authority | Điểm tính ở server |
| TC-002 | Server Authority | Desktop gửi dữ liệu, không quyết định |
| TC-003 | Server Authority | Server quyết định các quyết định quan trọng |
| TC-004 | Server Authority | Không tin tưởng client cho dữ liệu quan trọng |
| TC-005 | Evidence | Audio/video không dùng để chấm trực tiếp |
| TC-006 | Evidence | Chấm dựa trên question + transcript + rubric + RAG |
| TC-007 | Evidence | Audio/video là evidence |
| TC-008 | Evidence | Không dùng facial expression |
| TC-009 | Recording | Camera/mic mở sẵn cho preview |
| TC-010 | Recording | MediaRecorder chỉ start khi bấm |
| TC-011 | Recording | Không ghi liên tục (mặc định) |
| TC-012 | Desktop STT | PhoWhisper đóng gói bắt buộc |
| TC-013 | Desktop STT | STT local không cần server |
| TC-014 | Desktop STT | Audio gốc được lưu riêng |
| TC-015 | Desktop STT | RNNoise tùy chọn |
| TC-016 | Server STT | Server STT chỉ cho web/re-grading |
| TC-017 | Server STT | Chọn Gemini hoặc Google Cloud |
| TC-018 | Server STT | Google Cloud cần JSON |
| TC-019 | AI Provider | AI_CONFIG_SOURCE quyết định config |
| TC-020 | AI Provider | Ollama phải hỗ trợ JSON schema |
| TC-021 | AI Provider | Ollama embedding 768 chiều |
| TC-022 | AI Grading | LLM trả JSON đúng schema |
| TC-023 | AI Grading | LLM trả confidence |
| TC-024 | AI Grading | Không lưu chain-of-thought dài |
| TC-025 | AI Grading | Chỉ lưu reasoning summary |
| TC-026 | RAG | Chấm phải dùng RAG |
| TC-027 | RAG | Không dùng general knowledge |
| TC-028 | RAG | Filter theo course/topic/LO |
| TC-029 | RAG | Dùng top-K chunks |
| TC-030 | Electron | contextIsolation = true |
| TC-031 | Electron | nodeIntegration = false |
| TC-032 | Electron | sandbox = true |
| TC-033 | Electron | Whitelist IPC |
| TC-034 | Electron | Không expose fs/child_process/shell |
| TC-035 | API Security | JWT auth |
| TC-036 | API Security | RBAC |
| TC-037 | API Security | Rate limiting |
| TC-038 | API Security | Audit logging |
| TC-039 | API Security | Không expose secret |
| TC-040 | Secrets | Không commit vào Git |
| TC-041 | Secrets | Dùng .env |
| TC-042 | Secrets | Production dùng secret manager |
| TC-043 | Secrets | Không gửi API key xuống Electron |
| TC-044 | Local LLM | Không gửi full rubric |
| TC-045 | Local LLM | Không gửi grading prompt |
| TC-046 | Local LLM | Không gửi answer key |
| TC-047 | Local LLM | Chỉ fallback/offline/extraction |
| TC-048 | Upload | Chunked upload |
| TC-049 | Upload | SHA256 checksum |
| TC-050 | Upload | Resumable |
| TC-051 | Upload | Background, không block UI |
| TC-052 | Upload | Song song với trả lời |
| TC-053 | Evidence | SHA256 cho mỗi file |
| TC-054 | Evidence | Server verify checksum |
| TC-055 | Evidence | Có thể dùng chained hashes |
| TC-056 | Concurrency | Không duplicate submit |
| TC-057 | Concurrency | Transaction/state validation |
| TC-058 | Concurrency | Unique constraint exam session |
| TC-059 | Snapshot | PUBLISHED tạo snapshot |
| TC-060 | Snapshot | Không đổi sau khi student bắt đầu |
| TC-061 | Snapshot | Đổi không ảnh hưởng active exam |
| TC-062 | Snapshot | Re-grade dùng snapshot gốc |
| TC-063 | Desktop Perf | Worker thread/child process |
| TC-064 | Desktop Perf | Không hashing/splitting trong renderer |
| TC-065 | Desktop Perf | SQLite mã hóa nếu cần |
| TC-066 | Server Perf | Không gửi full PDF |
| TC-067 | Server Perf | Chỉ top-K chunks |
| TC-068 | Server Perf | Batch embedding |
| TC-069 | Server Perf | Cache embedding |
| TC-070 | Idempotency | Submit/finish/upload idempotent |
| TC-071 | Idempotency | Idempotency-Key header |
| TC-072 | Error | Standard error format |
| TC-073 | Error | Không expose stack trace |
| TC-074 | Error | Crash recovery |
| TC-075 | Error | Offline queue |
| TC-076 | Config | Không hardcode config |
| TC-077 | Config | Configurable thresholds |
