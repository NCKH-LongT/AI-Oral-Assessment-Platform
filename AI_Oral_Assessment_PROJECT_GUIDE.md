# AI Oral Assessment Platform
## Project Guide for Codex / AI Coding Agent

> **Mở rộng tài khoản/desktop 13/09/2026:** Google OIDC (web + trình duyệt hệ thống cho Electron), admin đổi vai trò, enrollment theo môn gồm đề công bố tương lai, môn luyện tập mặc định, tab con/popup quản lý, cấu hình credentials AI/OAuth/STT trên web, menu đổi domain desktop và electron-builder/CI cho Windows/Linux/macOS. Migration `0003` giữ dữ liệu cũ. Xem [thiết kế](docs/architecture/accounts-courses-desktop.md) và [build desktop](docs/desktop-build.md).

> **Cập nhật 13/09/2026:** hoàn thiện CRUD môn/rubric/đề nháp, xóa môn trống, archive/restore riêng, chặn xóa rubric đang dùng, sao chép đề đã công bố thành bản nháp. Desktop/web có kiểm tra tiếng ồn 5 giây qua Web Audio, yêu cầu tìm nơi yên lặng khi quá ồn và có nút bỏ qua. Giữ bộ lọc FFmpeg trước STT; chưa thay bằng Spleeter khi chưa có benchmark. Không đổi schema/dependency/service Docker; CI GitHub Actions có test âm thanh, repository chưa có Jenkinsfile. Chi tiết hành vi API, ngưỡng tương đối và giới hạn: [CRUD & kiểm tra tiếng ồn](docs/architecture/crud-noise-check.md).

> **Bổ sung cấu hình Google:** ADMIN có thể upload/thay JSON service account trực tiếp từ trang Cấu hình giọng nói. Credentials nằm trong volume riêng của ứng dụng, dùng chung API/worker, không trả private key về web và không đưa vào Git. Xem [README](README.md#google-cloud-speech-to-text).

> Tài liệu này là nguồn mô tả kiến trúc và kế hoạch triển khai chính của dự án.
> Mục tiêu là để Codex hoặc AI Coding Agent có thể đọc tài liệu này, hiểu hệ thống, chia nhỏ công việc và xây dựng theo từng giai đoạn mà không phá vỡ kiến trúc tổng thể.

> **Cập nhật source ngày 11/09/2026:** giai đoạn 1 đã mở rộng một giáo trình PDF/môn, tách chương/header, chủ đề nhiều LO/chương/tài liệu, lọc nhiễu trước STT, admin chọn local/Google/server nội bộ, admin nhận dạng Google và chấm lại có lịch sử, spinner khi STT/nộp bài. Xem [thiết kế cập nhật](docs/architecture/knowledge-speech.md), [README](README.md) và [biên bản kiểm thử](docs/validation.md). Với các mục bên dưới mô tả STT local cố định hoặc regrade chỉ ở giai đoạn 2, áp dụng cập nhật này; các mục offline, OCR, manual override và production chưa tự động trở thành đã triển khai.

---

# 1. Tổng quan dự án

## 1.1 Tên dự án

**AI Oral Assessment Platform**

Hệ thống thi vấn đáp bằng AI dành cho sinh viên, trong đó:

- Sinh viên đăng nhập vào ứng dụng desktop.
- Sinh viên nhận bài thi do giảng viên/Admin cấu hình.
- AI sinh hoặc chọn câu hỏi theo môn học, Learning Outcome, topic, độ khó và Exam Blueprint.
- Sinh viên trả lời bằng giọng nói.
- Ứng dụng ghi âm và ghi hình **chỉ trong thời gian sinh viên trả lời câu hỏi**.
- Audio được STT thành text.
- Việc chấm điểm chính thức dựa trên:
  - câu hỏi;
  - transcript từ STT;
  - rubric;
  - kiến thức được truy xuất từ RAG.
- Audio/video chỉ là **evidence**, không phải nguồn chấm điểm chính.
- Audio/video được chia chunk để upload lên server.
- Admin/Teacher có thể xem lại:
  - từng câu;
  - audio;
  - video;
  - transcript;
  - điểm AI;
  - rubric;
  - RAG evidence;
  - hoặc phát toàn bộ bài thi dưới dạng một video được ghép bằng FFmpeg.

---

# 2. Mục tiêu của hệ thống

## 2.1 Mục tiêu nghiệp vụ

Hệ thống cần giải quyết các vấn đề sau:

1. Chuẩn hóa thi vấn đáp.
2. Giảm tải việc đặt câu hỏi thủ công.
3. Chấm điểm sơ bộ/tự động theo rubric.
4. Cho phép giảng viên audit lại kết quả.
5. Lưu evidence để xử lý khiếu nại.
6. Tạo nhiều bài thi cho nhiều môn học khác nhau.
7. Tái sử dụng chung nền tảng, chỉ thay:
   - Knowledge Base;
   - Learning Outcome;
   - Topic;
   - Rubric;
   - Exam Blueprint.
8. Có khả năng phát triển từ MVP lên quy mô toàn trường.

---

# 3. Nguyên tắc kiến trúc bắt buộc

Codex phải tuân thủ các nguyên tắc sau.

## 3.1 Server là Source of Truth

Điểm chính thức phải được tính và lưu ở server.

Không tin tưởng dữ liệu quan trọng từ desktop client.

Desktop client chỉ gửi:

- transcript;
- metadata;
- media;
- hash;
- trạng thái session.

Server quyết định:

- question chính thức;
- rubric version;
- knowledge version;
- model version;
- điểm;
- final score;
- trạng thái hoàn thành bài thi.

---

## 3.2 Audio/video không dùng làm input chấm chính thức

Pipeline chuẩn:

```text
Audio
  ↓
STT
  ↓
Transcript
  ↓
Question + Transcript + Rubric + RAG
  ↓
LLM Grading
  ↓
Score
```

Audio/video:

```text
Audio + Video
      ↓
 Evidence Storage
      ↓
Teacher Review / Appeal
```

Không dùng video để nhận diện cảm xúc rồi cộng/trừ điểm.

Không dùng facial expression làm tiêu chí chấm.

---

## 3.3 Chỉ record khi sinh viên trả lời

Camera và microphone được mở sẵn để:

- kiểm tra thiết bị;
- hiển thị preview;
- giảm delay khi bắt đầu trả lời.

Nhưng MediaRecorder chỉ bắt đầu khi:

```text
Student clicks START ANSWER
```

và dừng khi:

```text
Student clicks FINISH ANSWER
```

Không ghi hình liên tục toàn bộ thời gian bài thi ở phiên bản mặc định.

---

## 3.4 Local LLM không phải security boundary

Không coi local LLM là nơi an toàn để giấu:

- full rubric;
- scoring policy;
- answer key;
- prompt grading;
- secret API key.

Bất kỳ dữ liệu nào được gửi xuống máy sinh viên đều có khả năng bị:

- reverse engineer;
- memory dump;
- hook IPC;
- inspect process;
- inspect network;
- decompile Electron.

Local LLM chỉ dùng cho:

- fallback;
- offline assistance;
- concept extraction;
- temporary analysis;
- optional follow-up;
- local RAG subset.

Điểm chính thức vẫn do server chấm.

---

# 4. Kiến trúc tổng thể

```text
                        ┌──────────────────────────────┐
                        │          ADMIN WEB           │
                        │                              │
                        │ Course                       │
                        │ Student                      │
                        │ Teacher                      │
                        │ Exam                         │
                        │ Rubric                       │
                        │ Documents                    │
                        │ Review                       │
                        │ Reports                      │
                        └───────────────┬──────────────┘
                                        │
                                        │ HTTPS REST / WS
                                        ▼
                        ┌──────────────────────────────┐
                        │        BACKEND API           │
                        │         FastAPI              │
                        │                              │
                        │ Auth                         │
                        │ User                         │
                        │ Course                       │
                        │ Exam                         │
                        │ Assessment                   │
                        │ Evidence                     │
                        │ Audit                        │
                        └───────┬────────┬─────────────┘
                                │        │
                  ┌─────────────┘        └─────────────┐
                  ▼                                    ▼
         ┌─────────────────┐                  ┌─────────────────┐
         │ PostgreSQL      │                  │ Object Storage  │
         │ + pgvector      │                  │ MinIO / S3      │
         └─────────────────┘                  └─────────────────┘
                  │
                  ▼
        ┌──────────────────────────────┐
        │         AI SERVICE           │
        │                              │
        │ Question Generation          │
        │ Grading                      │
        │ Follow-up                    │
        │ RAG Retrieval                │
        │ Embedding                    │
        │ Document Extraction          │
        └───────────────┬──────────────┘
                        │
              ┌─────────┴─────────┐
              ▼                   ▼
          Cloud LLM           Self-host LLM
          Gemini/API          Gemma/Qwen/etc.

┌──────────────────────────────────────────────────────────────┐
│                       ELECTRON CLIENT                        │
│                                                              │
│ React + TypeScript                                           │
│ Login                                                        │
│ Exam UI                                                      │
│ Camera Preview                                               │
│ Mic Ready                                                    │
│ MediaRecorder                                                │
│ Local STT                                                    │
│ Local SQLite Cache                                           │
│ Upload Queue                                                 │
│ Optional Local LLM                                           │
└──────────────────────────────────────────────────────────────┘
```

---

# 5. Công nghệ đề xuất

## 5.1 Desktop

```text
Electron
React
TypeScript
Vite
Zustand hoặc Redux Toolkit
SQLite
WebRTC
MediaRecorder API
FFmpeg
faster-whisper hoặc whisper.cpp
```

---

## 5.2 Admin Web

```text
Next.js
React
TypeScript
TanStack Query
Zod
TailwindCSS hoặc UI Framework phù hợp
```

---

## 5.3 Backend

```text
Python
FastAPI
SQLAlchemy
Alembic
Pydantic
PostgreSQL
Redis
Celery hoặc worker tương đương
```

---

## 5.4 Storage

MVP:

```text
MinIO
```

Production:

```text
S3-compatible Object Storage
```

---

## 5.5 AI / RAG

```text
Cloud LLM:
Gemini hoặc LLM API tương đương

Self-host option:
Gemma / Qwen / model phù hợp

Embedding:
Embedding API hoặc local embedding model

Vector DB:
MVP       → PostgreSQL + pgvector
Scale up  → có thể tách Qdrant
```

---

# 6. Cấu trúc Repository đề xuất

Không xây microservice quá sớm.

Khởi đầu bằng monorepo.

```text
ai-oral-assessment/
│
├── apps/
│   ├── desktop/
│   └── admin-web/
│
├── services/
│   ├── api/
│   ├── ai-worker/
│   ├── media-worker/
│   └── document-worker/
│
├── packages/
│   ├── shared-types/
│   ├── api-client/
│   └── ui-components/
│
├── infrastructure/
│   ├── docker/
│   ├── nginx/
│   └── scripts/
│
├── docs/
│   ├── architecture/
│   ├── api/
│   └── decisions/
│
├── docker-compose.yml
├── .env.example
├── README.md
└── PROJECT_GUIDE.md
```

---

# 7. Domain Model chính

## 7.1 User

```text
User
 ├── id
 ├── username
 ├── password_hash
 ├── role
 ├── status
 └── created_at
```

Roles:

```text
ADMIN
TEACHER
STUDENT
REVIEWER
```

---

## 7.2 Course

```text
Course
 ├── id
 ├── code
 ├── name
 ├── description
 └── status
```

---

## 7.3 Learning Outcome

```text
LearningOutcome
 ├── id
 ├── course_id
 ├── code
 ├── description
 └── weight
```

---

## 7.4 Topic

```text
Topic
 ├── id
 ├── course_id
 ├── learning_outcome_id
 ├── name
 └── description
```

---

## 7.5 Document

```text
Document
 ├── id
 ├── course_id
 ├── filename
 ├── mime_type
 ├── storage_url
 ├── version
 ├── status
 └── uploaded_at
```

---

## 7.6 DocumentChunk

```text
DocumentChunk
 ├── id
 ├── document_id
 ├── course_id
 ├── learning_outcome_id
 ├── topic_id
 ├── page_number
 ├── slide_number
 ├── content
 ├── embedding
 └── metadata
```

---

## 7.7 Rubric

```text
Rubric
 ├── id
 ├── course_id
 ├── name
 ├── version
 ├── status
 └── created_at
```

---

## 7.8 RubricCriterion

```text
RubricCriterion
 ├── id
 ├── rubric_id
 ├── name
 ├── description
 ├── max_score
 └── weight
```

---

## 7.9 Exam

```text
Exam
 ├── id
 ├── course_id
 ├── name
 ├── question_count
 ├── time_limit
 ├── rubric_id
 ├── status
 └── published_at
```

---

## 7.10 Exam Blueprint

Ví dụ:

```yaml
questions: 8

distribution:

  - topic: requirement_engineering
    difficulty: easy
    count: 1

  - topic: requirement_engineering
    difficulty: medium
    count: 1

  - topic: architecture
    difficulty: medium
    count: 2

  - topic: testing
    difficulty: medium
    count: 2

  - topic: uml
    difficulty: hard
    count: 2
```

Không để AI tự do quyết định tất cả câu hỏi.

---

## 7.11 ExamSnapshot

Khi publish bài thi cần freeze:

```text
ExamSnapshot
 ├── exam_id
 ├── exam_version
 ├── rubric_version
 ├── knowledge_version
 ├── question_prompt_version
 ├── grading_prompt_version
 ├── llm_model
 └── created_at
```

Snapshot không được thay đổi sau khi student bắt đầu thi.

---

## 7.12 ExamSession

```text
ExamSession
 ├── id
 ├── exam_id
 ├── exam_snapshot_id
 ├── student_id
 ├── status
 ├── started_at
 ├── completed_at
 └── final_score
```

Statuses:

```text
CREATED
DEVICE_CHECK
IN_PROGRESS
UPLOADING
SUBMITTED
REVIEW_REQUIRED
COMPLETED
CANCELLED
```

---

## 7.13 QuestionAttempt

```text
QuestionAttempt
 ├── id
 ├── exam_session_id
 ├── question_id
 ├── sequence
 ├── started_at
 ├── finished_at
 ├── transcript
 ├── stt_confidence
 └── status
```

---

## 7.14 Assessment

```text
Assessment
 ├── id
 ├── question_attempt_id
 ├── score
 ├── confidence
 ├── criteria_json
 ├── missing_concepts
 ├── reasoning_summary
 ├── retrieved_chunk_ids
 ├── rubric_version
 ├── knowledge_version
 ├── model
 ├── model_version
 ├── prompt_version
 └── created_at
```

Không lưu private chain-of-thought từ LLM.

Chỉ lưu reasoning summary ngắn để audit.

---

## 7.15 Evidence

```text
Evidence
 ├── id
 ├── question_attempt_id
 ├── type
 ├── storage_url
 ├── sha256
 ├── duration
 ├── size
 ├── upload_status
 └── created_at
```

Types:

```text
AUDIO
VIDEO
MERGED_VIDEO
```

---

# 8. Media Recording Flow

## 8.1 Device initialization

Khi vào bài thi:

```text
Request camera permission
        ↓
Request microphone permission
        ↓
Show camera preview
        ↓
Run microphone test
        ↓
READY
```

Không record.

---

## 8.2 Start Answer

```text
Student clicks START ANSWER
        ↓
create QuestionAttempt
        ↓
MediaRecorder.start()
        ↓
Record audio
Record video
        ↓
Start timer
```

---

## 8.3 Finish Answer

```text
Student clicks FINISH ANSWER
        ↓
MediaRecorder.stop()
        ↓
Generate local media files
        ↓
Audio → STT
        ↓
Transcript
        ↓
Submit transcript
        ↓
Create background upload job
```

---

# 9. Media Upload

Không upload file media lớn trong một request duy nhất.

## 9.1 Chunk Flow

```text
media.webm
   ↓
split chunks
   ↓

chunk_001
chunk_002
chunk_003
...
```

API flow:

```text
POST /uploads/init

PUT /uploads/{uploadId}/chunks/{index}

POST /uploads/{uploadId}/complete
```

---

## 9.2 Chunk Metadata

Mỗi chunk cần:

```json
{
  "uploadId": "...",
  "chunkIndex": 1,
  "totalChunks": 10,
  "size": 4194304,
  "sha256": "..."
}
```

---

## 9.3 Recommended Chunk Size

Khởi đầu:

```text
4 MB – 8 MB
```

Không hardcode.

Cho phép cấu hình.

---

## 9.4 Upload Queue

Desktop phải có local queue:

```text
PENDING
UPLOADING
COMPLETED
FAILED
RETRY
```

Upload được chạy song song với việc sinh viên trả lời câu tiếp theo.

Không block UI vì media upload.

---

# 10. Video Playback cho Admin

## 10.1 Playback từng câu

Admin có thể chọn:

```text
Question 1
Question 2
Question 3
```

và xem:

```text
video
audio
transcript
score
rubric
retrieved evidence
```

---

## 10.2 Full Exam Playback

Không merge ngay tất cả video sau khi thi.

Dùng lazy generation:

```text
Admin requests Full Exam
        ↓
merged video exists?
      /        \
    yes        no
     ↓          ↓
   play      enqueue FFmpeg job
                  ↓
             generate MP4
                  ↓
                cache
```

---

# 11. STT

## 11.1 Primary Strategy

Ưu tiên:

```text
Audio
  ↓
Local STT
  ↓
Transcript
```

Mục đích:

- giảm latency;
- giảm chi phí server;
- không upload audio trước khi chấm;
- hỗ trợ mạng yếu.

---

## 11.2 STT Output

```json
{
  "text": "Dependency injection là...",
  "language": "vi",
  "confidence": 0.91,
  "duration": 46.2
}
```

Nếu STT confidence thấp:

```text
mark REVIEW_REQUIRED
```

---

# 12. RAG Pipeline

## 12.1 Input

Admin có thể upload:

```text
PDF
PPTX
DOCX
```

---

## 12.2 Processing

```text
Upload
  ↓
Object Storage
  ↓
Extract text/content
  ↓
Normalize
  ↓
Identify:
- headings
- slide/page
- topic
- learning outcome
- concepts
  ↓
Chunk
  ↓
Embedding
  ↓
pgvector
```

---

## 12.3 Chunking

Không chỉ split mỗi 500 tokens.

Chunk phải giữ ngữ nghĩa.

Ưu tiên:

```text
section
paragraph group
slide
concept
definition
example
```

Metadata bắt buộc:

```text
course
document
page
slide
topic
learning_outcome
version
```

---

## 12.4 Retrieval

Không search toàn database.

Flow:

```text
Filter
  ↓
course_id
learning_outcome
topic
knowledge_version
  ↓
Vector Search
  ↓
Top K
  ↓
Optional Reranker
  ↓
LLM
```

---

# 13. Tách Knowledge RAG và Rubric RAG

Không trộn hoàn toàn hai mục đích.

```text
                    Grading Query
                         │
             ┌───────────┴───────────┐
             ▼                       ▼
       Knowledge Retrieval      Rubric Retrieval
             │                       │
             └───────────┬───────────┘
                         ▼
                    Grading LLM
```

Knowledge chứa:

```text
lecture content
definitions
examples
concept relationships
theory
```

Rubric chứa:

```text
criteria
expected concept
score boundaries
acceptable alternatives
common mistakes
```

---

# 14. AI Question Generation

## 14.1 Không cho AI tự chọn mọi thứ

AI phải nhận constraint từ Exam Blueprint.

Input:

```json
{
  "course": "...",
  "learningOutcome": "LO2",
  "topic": "Architecture",
  "difficulty": "MEDIUM",
  "previousQuestions": [],
  "knowledgeChunks": []
}
```

Output:

```json
{
  "question": "...",
  "difficulty": "MEDIUM",
  "expectedConcepts": [],
  "referenceChunkIds": []
}
```

`expectedConcepts` chỉ lưu server.

Không gửi xuống desktop trước khi student trả lời.

---

# 15. AI Grading

## 15.1 Input

```text
Question
+
Transcript
+
Expected Concepts
+
Rubric
+
Retrieved Knowledge
```

---

## 15.2 Output Schema

LLM bắt buộc trả structured JSON.

Ví dụ:

```json
{
  "totalScore": 7.5,
  "maxScore": 10,
  "confidence": 0.87,
  "criteria": [
    {
      "name": "knowledge_correctness",
      "score": 4.0,
      "maxScore": 5.0,
      "comment": "..."
    },
    {
      "name": "explanation",
      "score": 1.5,
      "maxScore": 2.0,
      "comment": "..."
    }
  ],
  "missingConcepts": [],
  "misconceptions": [],
  "reviewRequired": false,
  "reasoningSummary": "..."
}
```

---

# 16. Confidence Gate

Không accept mọi điểm từ AI.

Ví dụ:

```text
confidence >= 0.85
       ↓
auto accept

confidence < 0.85
       ↓
teacher review
```

Các trường hợp bắt buộc review:

```text
STT confidence thấp
RAG retrieval yếu
LLM output invalid
LLM uncertainty cao
Score gần ngưỡng pass/fail
Score quá cao hoặc quá thấp bất thường
```

Threshold phải configurable.

---

# 17. Local LLM

## 17.1 Không lưu full grading secret

Không tải xuống desktop:

```text
full rubric
answer key
grading prompt
exact score mapping
secret API key
```

---

## 17.2 Local LLM được phép làm

```text
concept detection
answer completeness
basic misconception detection
local fallback
follow-up assistance
offline temporary result
```

---

## 17.3 Offline Scoring

Nếu muốn hỗ trợ offline:

```text
Local model
   ↓
Temporary Assessment
   ↓
stored locally
   ↓
network restored
   ↓
server re-grade
   ↓
Official Score
```

Không dùng temporary score làm official score.

---

# 18. Security

## 18.1 Authentication

MVP:

```text
username/password
JWT access token
refresh token
```

Password:

```text
Argon2 hoặc bcrypt
```

Không lưu plaintext password.

---

## 18.2 Production

Thêm:

```text
device registration
session binding
rate limiting
refresh token rotation
RBAC
audit log
TLS
signed exam manifest
```

---

## 18.3 Local Storage

SQLite cache phải mã hóa.

Media local nên lưu trong private application directory.

Không lưu:

```text
API secret
LLM key
database password
```

trong Electron source.

---

## 18.4 Electron Security

Bắt buộc:

```text
contextIsolation = true
nodeIntegration = false
sandbox = true
```

Dùng preload script với whitelist IPC.

Không expose:

```text
fs
child_process
shell
```

trực tiếp cho renderer.

---

# 19. Evidence Integrity

Mỗi evidence file:

```text
SHA256(file)
```

Server lưu checksum.

Có thể tăng integrity bằng chained hashes:

```text
H1 = SHA256(Q1)
H2 = SHA256(H1 + Q2)
H3 = SHA256(H2 + Q3)
```

Không xem đây là thay thế cho digital signature server-side.

---

# 20. Audit Log

Phải log các event quan trọng:

```text
LOGIN
START_EXAM
START_QUESTION
START_RECORD
STOP_RECORD
STT_COMPLETED
TRANSCRIPT_SUBMITTED
QUESTION_GRADED
UPLOAD_STARTED
UPLOAD_COMPLETED
FINISH_EXAM
ADMIN_OVERRIDE_SCORE
REGRADE
```

Audit log nên append-only.

---

# 21. GIAI ĐOẠN 1 — MVP

## 21.1 Mục tiêu

Chứng minh end-to-end:

```text
Upload Course Material
        ↓
Create Rubric
        ↓
Create Exam
        ↓
Student Login
        ↓
Question
        ↓
Voice Answer
        ↓
STT
        ↓
AI Grading
        ↓
Store Evidence
        ↓
Admin Review
```

---

## 21.2 MVP Scope

### Desktop

Làm:

- login;
- list exam;
- start exam;
- camera preview;
- microphone test;
- show question;
- start answer;
- record audio;
- record video;
- stop answer;
- STT;
- submit transcript;
- display next question;
- finish exam;
- simple upload progress.

Không làm:

- local LLM;
- full offline exam;
- advanced anti-cheat;
- complicated crash recovery;
- Kubernetes.

---

## 21.3 Backend MVP

Modules:

```text
auth
users
courses
documents
rubrics
exams
exam_sessions
questions
grading
evidence
```

---

## 21.4 Admin MVP

Pages:

```text
Login
Dashboard
Student Management
Course Management
Document Upload
Rubric Management
Exam Builder
Exam Results
Exam Review
```

---

## 21.5 RAG MVP

Làm:

```text
PDF/PPTX upload
extract
chunk
embedding
pgvector
retrieve top-k
```

Không làm:

```text
complex knowledge graph
multi-agent RAG
cross-encoder reranking bắt buộc
```

---

## 21.6 AI MVP

Làm:

```text
question generation
grading
structured output
basic confidence
```

---

## 21.7 MVP Acceptance Criteria

- [ ] Student đăng nhập được.
- [ ] Student thấy bài thi được assign.
- [ ] Camera preview hoạt động.
- [ ] Microphone test hoạt động.
- [ ] Video/audio chỉ record sau khi Start Answer.
- [ ] Stop Answer sinh media file hợp lệ.
- [ ] Audio STT thành transcript.
- [ ] Transcript được server nhận.
- [ ] Server gọi RAG.
- [ ] Server chấm điểm theo rubric.
- [ ] Grading trả structured JSON.
- [ ] Admin xem được transcript.
- [ ] Admin xem điểm từng câu.
- [ ] Admin nghe audio.
- [ ] Admin xem video.
- [ ] Final score được tính server-side.
- [ ] Các lỗi cơ bản được log.

---

# 22. GIAI ĐOẠN 2 — PILOT

## 22.1 Mục tiêu

Chạy thử với lớp thật:

```text
30 – 100 students
```

và đảm bảo:

```text
không mất bài
có thể resume upload
có thể audit
có thể re-grade
```

---

## 22.2 Desktop Pilot

Thêm:

- encrypted SQLite;
- local session cache;
- upload queue;
- resumable upload;
- retry;
- disk space check;
- network check;
- crash recovery;
- recover incomplete answer;
- device error handling;
- local diagnostics.

---

## 22.3 Media Pilot

Thêm:

```text
chunk upload
checksum
resume
background upload
upload status
server verification
```

---

## 22.4 Exam Snapshot

Khi publish:

```text
freeze:
- exam version
- rubric version
- knowledge version
- prompt version
- model version
```

---

## 22.5 RAG Pilot

Nâng lên:

```text
metadata filter
+
vector search
+
optional reranker
```

---

## 22.6 Grading Pilot

Thêm:

```text
confidence gate
teacher review queue
manual override
re-grade
grading history
```

Manual override phải log:

```text
old score
new score
teacher
reason
timestamp
```

---

## 22.7 Media Review

Admin:

- xem từng câu;
- timeline;
- transcript sync;
- play full exam;
- lazy FFmpeg concat.

---

## 22.8 Pilot Acceptance Criteria

- [ ] App crash không làm mất bài đã trả lời.
- [ ] Network down tạm thời không làm mất evidence.
- [ ] Upload có thể resume.
- [ ] Checksum server khớp client.
- [ ] Admin xem được trạng thái upload.
- [ ] Exam snapshot được freeze.
- [ ] Knowledge update không ảnh hưởng session đang thi.
- [ ] Rubric update không ảnh hưởng session đang thi.
- [ ] Teacher review được các câu low confidence.
- [ ] Manual override có audit log.
- [ ] Re-grade giữ được history.
- [ ] Có thể phát toàn bộ video bài thi.
- [ ] Có dashboard lỗi cơ bản.
- [ ] Có test với ít nhất một lớp pilot thật hoặc synthetic load tương đương.

---

# 23. GIAI ĐOẠN 3 — PRODUCTION

## 23.1 Mục tiêu

Đưa hệ thống thành platform dùng chính thức.

---

## 23.2 Kiến trúc Production

Tách workload nặng:

```text
API Service
AI Worker
STT Worker
Document Worker
Media Worker
```

Không bắt buộc tách từng domain thành microservice.

---

## 23.3 Queue

Các job không chạy synchronous trong API request:

```text
document extraction
embedding
STT server-side
media concat
re-grading
report generation
cleanup
archive
```

---

## 23.4 AI Gateway

Application gọi:

```text
AI Gateway
```

thay vì gọi provider trực tiếp.

Interface ví dụ:

```text
generate_question()
grade_answer()
generate_followup()
embed()
extract_document()
```

Provider adapters:

```text
GeminiProvider
SelfHostedProvider
FutureProvider
```

---

## 23.5 Object Storage Lifecycle

Thêm policy:

```text
hot storage
archive
retention
deletion
```

Retention phải configurable theo policy tổ chức.

---

## 23.6 Observability

Production cần:

```text
Prometheus
Grafana
Loki
OpenTelemetry
```

Metrics:

```text
exam_started_total
exam_completed_total
exam_failed_total
upload_failure_rate
upload_retry_count
stt_latency
grading_latency
rag_latency
llm_error_rate
token_usage
cost_per_exam
review_required_rate
```

---

## 23.7 AI Evaluation

Tạo Golden Dataset.

Ví dụ:

```text
500 historical answers
```

được giảng viên chấm.

Mỗi lần thay:

```text
model
prompt
rubric
retrieval
embedding
```

phải chạy regression.

Metrics:

```text
MAE AI score vs teacher score
correlation
pass/fail agreement
review rate
invalid output rate
```

---

## 23.8 Production Acceptance Criteria

- [ ] Horizontal scaling cho API.
- [ ] Worker scaling độc lập.
- [ ] Object storage production-ready.
- [ ] Database backup.
- [ ] Restore test.
- [ ] Rate limiting.
- [ ] Audit log.
- [ ] Monitoring.
- [ ] Alerting.
- [ ] CI/CD.
- [ ] Automated migrations.
- [ ] AI regression suite.
- [ ] Security review.
- [ ] Load test.
- [ ] Failure recovery test.
- [ ] Backup/restore drill.
- [ ] Data retention policy.
- [ ] Incident logging.
- [ ] Admin manual review workflow hoàn chỉnh.

---

# 24. API Guidelines

## 24.1 Authentication

```text
POST /auth/login
POST /auth/refresh
POST /auth/logout
```

---

## 24.2 Exam

```text
GET  /exams/available
POST /exam-sessions
GET  /exam-sessions/{id}
POST /exam-sessions/{id}/start
POST /exam-sessions/{id}/finish
```

---

## 24.3 Questions

```text
POST /exam-sessions/{id}/next-question
POST /question-attempts/{id}/start
POST /question-attempts/{id}/submit
```

---

## 24.4 STT / Transcript

Nếu STT local:

```text
POST /question-attempts/{id}/transcript
```

Nếu STT server:

```text
POST /question-attempts/{id}/audio-for-stt
```

---

## 24.5 Evidence

```text
POST /uploads/init
PUT  /uploads/{id}/chunks/{index}
POST /uploads/{id}/complete
GET  /uploads/{id}/status
```

---

## 24.6 Admin Review

```text
GET  /admin/exam-sessions/{id}
GET  /admin/question-attempts/{id}
POST /admin/assessments/{id}/override
POST /admin/exam-sessions/{id}/regrade
POST /admin/exam-sessions/{id}/merged-video
```

---

# 25. Error Handling

Mọi API error trả format chuẩn:

```json
{
  "error": {
    "code": "EXAM_SESSION_NOT_ACTIVE",
    "message": "Exam session is not active",
    "details": {}
  }
}
```

Không trả stack trace cho client.

---

# 26. Idempotency

Các API quan trọng phải hỗ trợ retry an toàn.

Ví dụ:

```text
submit answer
finish exam
upload complete
```

Dùng:

```text
Idempotency-Key
```

để tránh request duplicate.

---

# 27. Concurrency

Không cho client submit cùng một QuestionAttempt nhiều lần.

Server phải dùng transaction hoặc state validation:

```text
STARTED
  ↓
SUBMITTED
```

Không cho:

```text
SUBMITTED
  ↓
SUBMITTED
```

trừ khi endpoint được thiết kế idempotent.

---

# 28. Performance Optimization

## 28.1 Không block UI

Các việc sau không chạy trong Electron renderer:

```text
FFmpeg
STT nặng
large file hashing
large file splitting
```

Chạy:

```text
worker thread
child process
native/service process
```

---

## 28.2 Upload Background

Không chờ media upload xong mới cho Next Question.

Flow:

```text
Finish Answer
      ↓
STT
      ↓
Submit Transcript
      ↓
Next Question

parallel:
media upload
```

---

## 28.3 AI Requests

Không gửi toàn bộ PDF vào mỗi grading request.

Chỉ gửi:

```text
top-k relevant chunks
```

---

## 28.4 Caching

Có thể cache:

```text
course metadata
rubric metadata
embedding query
document processing status
exam manifest
```

Không cache official score sai context.

---

# 29. Những điều cần tránh

## 29.1 Không build quá nhiều microservice từ MVP

Tránh:

```text
15 services
Kafka
Kubernetes
service mesh
```

ngay đầu dự án.

Lý do:

```text
development overhead
deployment complexity
debug khó
không có traffic thực để justify
```

---

## 29.2 Không trust desktop

Không dùng:

```text
client score
client exam timer
client official question count
```

làm nguồn dữ liệu cuối cùng.

---

## 29.3 Không để LLM tự sinh câu hỏi hoàn toàn tự do

Phải constraint bằng:

```text
Exam Blueprint
Learning Outcome
Topic
Difficulty
Previous Question
```

---

## 29.4 Không chấm từ general knowledge của LLM

Phải dùng:

```text
RAG
+
Rubric
```

để grounded grading.

---

## 29.5 Không lưu chain-of-thought

Không yêu cầu hoặc lưu internal reasoning dài của model.

Chỉ lưu:

```text
reasoning summary
evidence
criteria comments
```

---

## 29.6 Không gửi API key xuống Electron

Tất cả LLM API call chính thức phải đi:

```text
Desktop
   ↓
Backend
   ↓
LLM
```

---

## 29.7 Không merge video ngay lập tức cho tất cả bài thi

Dùng lazy generation.

---

# 30. Testing Strategy

## 30.1 Unit Test

Test:

```text
score calculation
rubric validation
exam state transitions
chunk validation
hash validation
RAG filter
permission
```

---

## 30.2 Integration Test

Test:

```text
login → exam → answer → grading
upload → assemble → verify
document upload → embedding → retrieval
```

---

## 30.3 End-to-End

Automate:

```text
Admin creates exam
Student starts exam
Student submits answers
Server grades
Admin reviews
```

---

## 30.4 Failure Tests

Bắt buộc test:

```text
network loss
server restart
desktop crash
duplicate request
corrupt chunk
low disk
camera disconnected
microphone disconnected
STT failure
LLM timeout
LLM invalid JSON
RAG no result
```

---

# 31. CI/CD

MVP:

```text
GitHub Actions
```

Pipeline:

```text
lint
typecheck
unit test
build
docker build
integration test
```

Production thêm:

```text
security scan
dependency scan
migration check
deployment
smoke test
rollback
```

---

# 32. Logging

Mỗi log cần:

```text
request_id
user_id
exam_session_id
question_attempt_id
service
event
timestamp
```

Không log:

```text
password
access token
refresh token
API key
full sensitive prompt nếu không cần thiết
```

---

# 33. Configuration

Không hardcode:

```text
LLM model
embedding model
chunk size
top_k
confidence threshold
media chunk size
max upload retry
exam timeout
```

Dùng config/environment.

---

# 34. Definition of Done cho một feature

Một feature chỉ xem là hoàn thành khi:

- [ ] Business behavior đúng.
- [ ] API validation đầy đủ.
- [ ] Permission đúng.
- [ ] Error handling đầy đủ.
- [ ] Unit test.
- [ ] Integration test nếu cần.
- [ ] Log.
- [ ] Documentation.
- [ ] Không expose secret.
- [ ] Không block critical UI.
- [ ] Migration có rollback strategy.
- [ ] Acceptance criteria pass.

---

# 35. Codex Working Rules

Codex phải thực hiện theo quy tắc sau.

## 35.1 Trước khi code

Đọc:

```text
PROJECT_GUIDE.md
README.md
docs/architecture/
```

Sau đó:

1. Xác định phase hiện tại.
2. Xác định feature nằm trong scope hay chưa.
3. Không tự động implement feature thuộc phase sau nếu chưa cần.
4. Đọc schema hiện tại.
5. Kiểm tra test hiện tại.
6. Đề xuất implementation plan ngắn trước khi sửa nhiều file.

---

## 35.2 Khi implement

Ưu tiên:

```text
small commits
small modules
typed interfaces
explicit validation
testable business logic
```

Không tạo abstraction nếu chưa có nhu cầu rõ ràng.

---

## 35.3 Không tự ý thay đổi kiến trúc lõi

Không thay đổi các nguyên tắc sau trừ khi ADR được tạo:

```text
server authoritative scoring
transcript-based grading
record only during answer
RAG-grounded assessment
exam snapshot versioning
media evidence architecture
```

---

# 36. Suggested Implementation Order

## Sprint 0 — Foundation

- [ ] Monorepo.
- [ ] Docker Compose.
- [ ] PostgreSQL.
- [ ] MinIO.
- [ ] Redis.
- [ ] FastAPI skeleton.
- [ ] Admin Web skeleton.
- [ ] Electron skeleton.
- [ ] Shared configuration.
- [ ] CI.

---

## Sprint 1 — Authentication

- [ ] User schema.
- [ ] Login API.
- [ ] JWT.
- [ ] Role.
- [ ] Electron login.
- [ ] Admin login.
- [ ] Protected routes.

---

## Sprint 2 — Course & Documents

- [ ] Course CRUD.
- [ ] LO CRUD.
- [ ] Topic CRUD.
- [ ] Document upload.
- [ ] MinIO.
- [ ] Document metadata.
- [ ] Processing job.

---

## Sprint 3 — RAG

- [ ] Extraction.
- [ ] Chunking.
- [ ] Embedding.
- [ ] pgvector.
- [ ] Metadata filter.
- [ ] Retrieval API.
- [ ] RAG debug page.

---

## Sprint 4 — Rubric

- [ ] Rubric CRUD.
- [ ] Criteria.
- [ ] Versioning.
- [ ] Validation.
- [ ] Preview.

---

## Sprint 5 — Exam Builder

- [ ] Exam CRUD.
- [ ] Blueprint.
- [ ] Difficulty distribution.
- [ ] Question count.
- [ ] Publish.
- [ ] Snapshot.

---

## Sprint 6 — Desktop Exam

- [ ] Available exams.
- [ ] Start session.
- [ ] Camera preview.
- [ ] Mic test.
- [ ] Question UI.
- [ ] Start Answer.
- [ ] MediaRecorder.
- [ ] Finish Answer.

---

## Sprint 7 — STT

- [ ] Audio extraction.
- [ ] STT.
- [ ] Transcript preview.
- [ ] Submit transcript.
- [ ] STT confidence.

---

## Sprint 8 — AI Question + Grading

- [ ] Question service.
- [ ] RAG context.
- [ ] Grading service.
- [ ] Structured output.
- [ ] Validation.
- [ ] Confidence gate.

---

## Sprint 9 — Evidence Upload

- [ ] Upload init.
- [ ] Chunk upload.
- [ ] Complete.
- [ ] Hash.
- [ ] Local queue.
- [ ] Retry.

---

## Sprint 10 — Admin Review

- [ ] Exam result.
- [ ] Per-question review.
- [ ] Video player.
- [ ] Audio player.
- [ ] Transcript.
- [ ] Score.
- [ ] Rubric.
- [ ] Evidence.
- [ ] Override.

---

# 37. Phase Gate

Không chuyển MVP → Pilot nếu chưa pass:

- [ ] 100 bài synthetic end-to-end.
- [ ] Không mất QuestionAttempt.
- [ ] Không mất transcript.
- [ ] Media có thể xem lại.
- [ ] Score trace được.
- [ ] RAG references trace được.
- [ ] Rubric version trace được.

Không chuyển Pilot → Production nếu chưa pass:

- [ ] Pilot với user thật.
- [ ] Crash recovery.
- [ ] Network recovery.
- [ ] Upload resume.
- [ ] Re-grade.
- [ ] Manual review.
- [ ] AI regression.
- [ ] Load test.
- [ ] Backup/restore.
- [ ] Monitoring.
- [ ] Security review.

---

# 38. MVP Checklist tổng hợp

## Infrastructure

- [ ] Docker Compose.
- [ ] PostgreSQL.
- [ ] MinIO.
- [ ] Redis.
- [ ] migrations.

## Backend

- [ ] Auth.
- [ ] Users.
- [ ] Courses.
- [ ] Documents.
- [ ] RAG.
- [ ] Rubrics.
- [ ] Exams.
- [ ] Exam Sessions.
- [ ] Question Attempts.
- [ ] Assessment.
- [ ] Evidence.

## Desktop

- [ ] Login.
- [ ] Exam list.
- [ ] Device check.
- [ ] Camera preview.
- [ ] Start Answer.
- [ ] Record.
- [ ] Finish Answer.
- [ ] STT.
- [ ] Submit.
- [ ] Next Question.
- [ ] Finish Exam.

## AI

- [ ] Generate question.
- [ ] Structured grading.
- [ ] Rubric grounding.
- [ ] RAG grounding.
- [ ] confidence.

## Admin

- [ ] Students.
- [ ] Course.
- [ ] Documents.
- [ ] Rubric.
- [ ] Exam.
- [ ] Results.
- [ ] Review.

---

# 39. Pilot Checklist tổng hợp

- [ ] Encrypted local DB.
- [ ] Resume session.
- [ ] Retry upload.
- [ ] Chunk checksum.
- [ ] Background upload.
- [ ] Network status.
- [ ] Disk check.
- [ ] Exam Snapshot.
- [ ] RAG version.
- [ ] Rubric version.
- [ ] Prompt version.
- [ ] Model version.
- [ ] Review queue.
- [ ] Manual override.
- [ ] Re-grade.
- [ ] Full exam playback.
- [ ] Basic monitoring.

---

# 40. Production Checklist tổng hợp

- [ ] Production deployment.
- [ ] Scalable API.
- [ ] Worker pool.
- [ ] Object storage.
- [ ] CDN nếu cần.
- [ ] DB replication/backup.
- [ ] Observability.
- [ ] Alerting.
- [ ] Audit log.
- [ ] Security scan.
- [ ] Pen-test hoặc security review.
- [ ] Load test.
- [ ] Failover test.
- [ ] Backup restore test.
- [ ] AI regression dataset.
- [ ] Model evaluation.
- [ ] Cost monitoring.
- [ ] Data retention.
- [ ] Incident procedure.

---

# 41. AI Quality Checklist

Mỗi lần thay AI model:

- [ ] Structured JSON vẫn đúng schema.
- [ ] Score không drift quá ngưỡng.
- [ ] Không hallucinate evidence.
- [ ] Citation chunk tồn tại.
- [ ] Rubric criteria đầy đủ.
- [ ] Confidence hợp lý.
- [ ] Không chấm kiến thức ngoài RAG khi không được phép.
- [ ] Không trả private chain-of-thought.
- [ ] Latency trong SLA.
- [ ] Cost trong budget.

---

# 42. Media Quality Checklist

- [ ] Audio nghe được.
- [ ] Video phát được.
- [ ] Timestamp đúng.
- [ ] QuestionAttempt đúng.
- [ ] Audio/video không bị swap.
- [ ] Hash đúng.
- [ ] Chunk đủ.
- [ ] Có retry.
- [ ] Có cleanup.
- [ ] Admin playback hoạt động.

---

# 43. Security Checklist

- [ ] Password hash.
- [ ] HTTPS.
- [ ] Token expiry.
- [ ] Refresh rotation.
- [ ] RBAC.
- [ ] No API key in Electron.
- [ ] Electron context isolation.
- [ ] Electron nodeIntegration disabled.
- [ ] File path validation.
- [ ] Upload MIME validation.
- [ ] Upload size limit.
- [ ] Rate limit.
- [ ] SQL injection protection.
- [ ] XSS protection.
- [ ] Audit admin score override.
- [ ] Secrets in environment/secret manager.

---

# 44. Cách tối ưu chi phí AI

1. Không gửi nguyên tài liệu vào mỗi request.
2. Retrieve top-k chunk.
3. Dùng model nhẹ cho:
   - classification;
   - metadata extraction;
   - simple generation.
4. Dùng model mạnh hơn cho:
   - ambiguous grading;
   - low-confidence recheck.
5. Cache embedding.
6. Batch document embedding.
7. Không re-grade nếu không cần.
8. Log token/cost theo:
   - course;
   - exam;
   - student;
   - model.

---

# 45. Cách tối ưu UX sinh viên

Student không được chờ các bước không cần thiết.

Ideal flow:

```text
Finish Answer
   ↓
STT
   ↓
Submit Transcript
   ↓
Next Question
```

Trong background:

```text
encode
hash
chunk
upload
```

Nếu grading không cần trả ngay cho student thì cũng chạy background.

Student không cần thấy điểm từng câu trong lúc thi trừ khi exam policy yêu cầu.

---

# 46. Nguyên tắc Fairness

Không để câu hỏi quá khác nhau về độ khó.

Dùng:

```text
Exam Blueprint
Difficulty
LO
Topic
Question history
```

Có thể tạo question pool được teacher approve trước.

Production nên hỗ trợ hai mode:

```text
AI_GENERATED
QUESTION_BANK
HYBRID
```

HYBRID được khuyến nghị cho kỳ thi chính thức.

---

# 47. Recommended Modes

## Practice Mode

```text
AI adaptive
instant feedback
score visible
follow-up nhiều
```

## Official Exam Mode

```text
strict blueprint
snapshot
server grading
limited follow-up
hidden score until finish
full audit
```

Nên tách hai mode về policy ngay từ data model.

---

# 48. Future Extensions

Chưa implement trong MVP nhưng kiến trúc phải không cản trở:

```text
multi-language oral exam
live proctoring
teacher live monitor
question bank analytics
difficulty calibration
IRT
plagiarism/similarity detection
voice identity verification
learning analytics
LMS integration
SSO
Canvas/Moodle integration
```

---

# 49. Prompt cho Codex khi bắt đầu dự án

Có thể dùng prompt:

```text
Read PROJECT_GUIDE.md completely before making changes.

We are building the AI Oral Assessment Platform.

Current target phase: MVP.

Your task is to implement only the next incomplete MVP feature.

Before coding:
1. Inspect the repository.
2. Identify existing architecture and conventions.
3. List files that need to change.
4. Produce a short implementation plan.
5. Do not implement Pilot or Production features unless required as a foundation.

Important invariants:
- Server is authoritative for official scoring.
- Grading is based on question + STT transcript + rubric + RAG evidence.
- Audio/video are evidence only.
- Camera/mic may stay initialized, but recording starts only after Start Answer.
- Do not expose LLM secrets or grading secrets in Electron.
- Exam/Rubric/Knowledge versions must be traceable.
- Keep the MVP modular monolith; do not introduce unnecessary microservices.
- Add tests for all business-critical state transitions.

After implementation:
1. Run lint.
2. Run typecheck.
3. Run unit tests.
4. Run integration tests if applicable.
5. Summarize changes.
6. Report any remaining risks or TODOs.
```

---

# 50. Prompt cho Codex khi làm từng feature

```text
Read PROJECT_GUIDE.md.

Implement the feature: <FEATURE_NAME>

Current phase: <MVP|PILOT|PRODUCTION>

Requirements:
<PASTE REQUIREMENTS>

Acceptance criteria:
<PASTE CHECKLIST>

Before changing code:
- inspect current implementation;
- avoid breaking existing contracts;
- identify database/API/UI impact;
- write a short plan.

Implementation rules:
- prefer small cohesive modules;
- use existing project conventions;
- validate API input/output;
- add error handling;
- add audit/logging where relevant;
- add tests;
- do not add unrelated features.

After implementation:
- run tests;
- update documentation;
- list changed files;
- explain architectural decisions;
- list risks and follow-up work.
```

---

# 51. Final Architecture Decision Summary

Các quyết định chính của dự án:

```text
Desktop:
Electron + React + TypeScript

Backend:
FastAPI + Python

Admin:
Next.js

DB:
PostgreSQL

Vector:
pgvector

Cache:
Redis

Storage:
MinIO → S3

STT:
Local-first

AI:
Server-first

Local LLM:
Fallback only

Official grading:
Server

Evidence:
Audio + Video

Grading input:
Transcript

RAG:
Course + LO + Topic + Version aware

Media:
Per-answer recording + resumable chunk upload

Video review:
Per-question + lazy full-exam merge

Deployment:
Docker Compose → scalable production infrastructure
```

---

# 52. Core Principle

Toàn bộ hệ thống phải luôn giữ nguyên nguyên tắc:

> **Audio/video là evidence. Transcript là dữ liệu trả lời dùng để chấm. Rubric và RAG định nghĩa tiêu chuẩn chấm. Server là nguồn điểm chính thức. Local AI chỉ hỗ trợ tính liên tục và trải nghiệm, không phải nguồn tin cậy bảo mật.**

Đây là nguyên tắc trung tâm để hệ thống có thể phát triển từ prototype thành một nền tảng thi vấn đáp AI đáng tin cậy.
