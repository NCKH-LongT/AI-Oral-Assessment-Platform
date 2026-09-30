# System Overview

## 1. Giới thiệu

**AI Oral Assessment Platform** (mã nguồn: `AI-Oral-Assessment-Platform`) là hệ thống thi vấn đáp trên máy tính dành cho sinh viên, trong đó:

- Sinh viên đăng nhập vào ứng dụng desktop để làm bài thi
- Câu hỏi được sinh bởi AI dựa trên môn học, Learning Outcome, chủ đề, độ khó và blueprint
- Sinh viên trả lời bằng giọng nói; ứng dụng ghi âm và ghi hình
- Audio được chuyển thành văn bản (STT - Speech-to-Text) bằng PhoWhisper local
- Việc chấm điểm dựa trên: câu hỏi + transcript + rubric + kiến thức từ RAG
- Audio/video chỉ là **bằng chứng (evidence)**, không phải nguồn chấm điểm chính
- Giảng viên/Khảo thí có thể xem lại và duyệt kết quả

> **Giai đoạn hiện tại:** MVP đã triển khai, tập trung vào môn tiếng Anh.

---

## 2. Mục tiêu nghiệp vụ

| # | Mục tiêu                                           |
| - | ---------------------------------------------------- |
| 1 | Chuẩn hóa thi vấn đáp                           |
| 2 | Giảm tải việc ra đề thủ công                  |
| 3 | Chấm điểm sơ bộ/tự động theo rubric          |
| 4 | Cho phép giảng viên audit lại kết quả          |
| 5 | Lưu evidence để xử lý khiếu nại               |
| 6 | Tạo nhiều bài thi cho nhiều môn học khác nhau |
| 7 | Tái sử dụng chung nền tảng                      |

---

## 3. Kiến trúc tổng thể

```
┌──────────────────────────────────────────────────────────────────────┐
│                           ELECTRON CLIENT                              │
│  (React + TypeScript + PhoWhisper STT local)                         │
│  • Đăng nhập                                                         │
│  • Xem danh sách bài thi                                             │
│  • Ghi âm/ghi hình khi trả lời                                      │
│  • STT local bằng PhoWhisper                                         │
│  • Nghe lại và sửa transcript                                        │
│  • Upload media lên server                                            │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │ HTTPS REST / WebSocket
                                   ▼
┌──────────────────────────────────────────────────────────────────────┐
│                          ADMIN WEB (Next.js)                           │
│  • Quản lý môn học, tài liệu, rubric                                │
│  • Tạo và duyệt đề thi                                              │
│  • Xem kết quả và chấm lại                                           │
│  • Quản lý người dùng và phân quyền                                 │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │
                                   ▼
┌──────────────────────────────────────────────────────────────────────┐
│                     BACKEND API (FastAPI + Python)                    │
│                                                                       │
│  Auth │ Users │ Courses │ Documents │ Exams │ Grading │ Evidence      │
│                                                                       │
│  ┌─────────────┐         ┌─────────────┐                            │
│  │ PostgreSQL  │         │ Object S3   │                            │
│  │ + pgvector  │         │ (MinIO)     │                            │
│  └─────────────┘         └─────────────┘                            │
│           │                                                       │
│           ▼                                                       │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                    AI SERVICE                                 │   │
│  │  • Question Generation (Gemini / Ollama)                      │   │
│  │  • Grading (Gemini / Ollama)                                 │   │
│  │  • RAG Retrieval (Embedding + Vector Search)                  │   │
│  └─────────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────────┘
```

---

## 4. Các thành phần chính

### 4.1 Desktop Application

- **Công nghệ:** Electron + React + TypeScript
- **STT:** PhoWhisper-small INT8 chạy local
- **Chức năng:**
  - Đăng nhập, chọn máy chủ
  - Kiểm tra camera/microphone
  - Làm bài thi vấn đáp
  - Ghi âm/ghi hình khi trả lời
  - STT local → transcript
  - Nghe lại, sửa transcript bằng tay
  - Upload media lên server

### 4.2 Admin Web

- **Công nghệ:** Next.js + React + TypeScript
- **Chức năng:**
  - Quản lý môn học (CRUD, archive, delete)
  - Upload và xử lý tài liệu (PDF → chunks → embedding)
  - Tạo Learning Outcomes, Topics, Rubrics
  - Tạo và công bố đề thi
  - Xem kết quả, nghe/xem lại bài thi
  - Chấm lại, override điểm
  - Quản lý người dùng, phân quyền
  - Cấu hình hệ thống (AI provider, STT, OAuth)

### 4.3 Backend API

- **Công nghệ:** FastAPI + Python + SQLAlchemy + Alembic
- **Chức năng:**
  - Authentication (JWT, Google OAuth)
  - CRUD cho tất cả entities
  - Quản lý exam sessions
  - AI grading (Gemini hoặc Ollama local)
  - RAG retrieval
  - File upload (chunked, resumable)
  - Worker cho các job bất đồng bộ (document processing, grading)

### 4.4 Database

- **PostgreSQL + pgvector** cho:
  - Users, Courses, Enrollments
  - Learning Outcomes, Topics, Documents, Chunks
  - Rubrics, Exams, Exam Sessions, Question Attempts
  - Assessments, Evidence, Audit Logs

### 4.5 Object Storage

- **MinIO/S3** cho:
  - Audio/video files
  - Uploaded documents
  - Processed media

---

## 5. Actors (Người dùng hệ thống)

| Actor                                     | Vai trò         | Mô tả                                                                                          |
| ----------------------------------------- | ---------------- | ------------------------------------------------------------------------------------------------ |
| **Khảo thí (Examiner)**          | `EXAMINER`        | Người quản lý kỳ thi: tạo môn, giao đề, thêm sinh viên, setup lịch thi, chốt điểm |
| **Giảng viên (Teacher)**          | `TEACHER`      | Người nhận yêu cầu ra đề, tạo rubric, duyệt đề, chấm điểm/rà soát                |
| **Sinh viên (Student)**            | `STUDENT`      | Người thi trên máy tính, chỉ những sinh viên trong danh sách mới được thi           |
| **Admin hệ thống (System Admin)** | `SYSTEM_ADMIN` | Người cấu hình hệ thống và phân quyền                                                   |

---

## 6. Luồng chính của hệ thống

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        LUỒNG TẠO ĐỀ THI                                 │
├─────────────────────────────────────────────────────────────────────────┤
│  1. Khảo thí tạo môn học                                             │
│  2. Giảng viên upload giáo trình (PDF) → extract → chunk → embedding  │
│  3. Giảng viên tạo Learning Outcomes (LO) cho môn                     │
│  4. Giảng viên tạo Topics (liên kết LO + chương giáo trình)         │
│  5. Giảng viên tạo Rubric (tiêu chí đánh giá)                       │
│  6. Giảng viên tạo Exam Blueprint (phân bổ câu hỏi theo topic/difficulty) │
│  7. Giảng viên bấm "Sinh câu hỏi & công bố"                         │
│  8. AI sinh câu hỏi dựa trên blueprint + RAG knowledge               │
│  9. Giảng viên duyệt và chỉnh sửa đề                                │
│ 10. Khảo thí giao bài cho sinh viên                                   │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│                        LUỒNG LÀM BÀI THI                                │
├─────────────────────────────────────────────────────────────────────────┤
│  1. Sinh viên đăng nhập vào desktop                                   │
│  2. Sinh viên chọn bài thi                                            │
│  3. Kiểm tra camera/microphone                                        │
│  4. Sinh viên trả lời từng câu hỏi:                                  │
│     - Bấm "Bắt đầu trả lời" → ghi âm/ghi hình                       │
│     - Bấm "Kết thúc trả lời" → PhoWhisper STT → transcript           │
│     - Nghe lại, sửa transcript                                         │
│     - Bấm "Nộp câu trả lời"                                          │
│  5. Upload media lên server (background)                               │
│  6. Sau khi nộp đủ câu → "Nộp bài thi"                             │
│  7. Server chấm điểm bằng AI (question + transcript + rubric + RAG)  │
│  8. Sinh viên xem kết quả                                            │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│                        LUỒNG CHẤM ĐIỂM & DUYỆT                         │
├─────────────────────────────────────────────────────────────────────────┤
│  1. AI chấm điểm → confidence score                                  │
│  2. Nếu confidence ≥ threshold → auto accept                          │
│  3. Nếu confidence < threshold → yêu cầu giảng viên duyệt           │
│  4. Giảng viên xem transcript, audio, video, rubric, RAG evidence     │
│  5. Giảng viên có thể:                                               │
│     - Chấm lại (re-grade) với transcript đã sửa                      │
│     - Override điểm thủ công                                         │
│  6. Khảo thí chốt điểm cuối kỳ                                     │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 7. Các thuật ngữ quan trọng

| Thuật ngữ                     | Giải thích                                                            |
| ------------------------------- | ----------------------------------------------------------------------- |
| **Learning Outcome (LO)** | Chuẩn đầu ra - kiến thức/kỹ năng cần đánh giá                |
| **Topic**                 | Chủ đề - liên kết LO với chương giáo trình                    |
| **Rubric**                | Tiêu chí đánh giá - gồm các tiêu chí, mô tả, điểm tối đa |
| **Exam Blueprint**        | Bản thiết kế - phân bổ số câu hỏi theo topic/difficulty         |
| **Exam Snapshot**         | Ảnh chụp đề - freeze rubric, knowledge, prompt versions             |
| **RAG**                   | Retrieval-Augmented Generation - truy xuất kiến thức để grounding  |
| **STT**                   | Speech-to-Text - chuyển audio thành văn bản                         |
| **Evidence**              | Bằng chứng - audio/video gốc được lưu để audit                 |

---

## 8. Trạng thái các thực thể chính

### Exam Status

| Status        | Mô tả                                  |
| ------------- | ---------------------------------------- |
| `DRAFT`     | Bản nháp, chưa công bố              |
| `PUBLISHED` | Đã công bố, sinh viên có thể làm |
| `ARCHIVED`  | Đã lưu trữ                           |

### ExamSession Status

| Status              | Mô tả                    |
| ------------------- | -------------------------- |
| `DEVICE_CHECK`    | Đang kiểm tra thiết bị |
| `IN_PROGRESS`     | Đang làm bài            |
| `UPLOADING`       | Đang upload media         |
| `SUBMITTED`       | Đã nộp, chờ chấm      |
| `REVIEW_REQUIRED` | Cần giảng viên duyệt   |
| `COMPLETED`       | Hoàn thành               |

### QuestionAttempt Status

| Status         | Mô tả              |
| -------------- | -------------------- |
| `READY`      | Sẵn sàng trả lời |
| `RECORDING`  | Đang ghi âm        |
| `PROCESSING` | Đang xử lý STT    |
| `SUBMITTED`  | Đã nộp            |
| `GRADED`     | Đã chấm điểm    |

---

## 9. Giới hạn hiện tại (MVP)

- Chỉ hỗ trợ môn tiếng Anh trước
- STT local bằng PhoWhisper (không hỗ trợ offline hoàn toàn)
- AI chấm điểm bằng Gemini hoặc Ollama local
- Chưa hỗ trợ question bank
- Chưa hỗ trợ live proctoring

---

## 10. Tài liệu liên quan

| Tài liệu            | Đường dẫn                                       |
| --------------------- | --------------------------------------------------- |
| User Guide            | `docs/user-guide.md`                              |
| Architecture          | `docs/architecture/`                              |
| Project Guide         | `AI_Oral_Assessment_PROJECT_GUIDE.md`             |
| Business Rules        | `docs/specifications/06-business-rules.md`        |
| Technical Constraints | `docs/specifications/07-technical-constraints.md` |
