# Biên bản kiểm thử giai đoạn 1

Ngày kiểm tra: 10/09/2026. Chỉ ghi kết quả đã chạy; kiểm thử AI thật cần API key riêng.

| Hạng mục | Kết quả |
| --- | --- |
| Python lint (Ruff) | Đạt |
| TypeScript typecheck | Đạt |
| ESLint web | Đạt |
| Next.js production build | Đạt |
| Electron main/preload syntax | Đạt |
| npm audit sau cập nhật Next.js/Electron | 0 vulnerabilities tại thời điểm kiểm tra |
| 9 nhóm test API/unit/integration trên SQLite | Đạt |
| Cùng bộ test trên PostgreSQL 16 + pgvector 0.8.2 | Đạt |
| Alembic upgrade → downgrade → upgrade trên PostgreSQL | Đạt |
| Compose parse/validation | Đạt |
| Whisper tiny CPU: nhận dạng file giọng nói tiếng Anh thật | Đạt; nhận dạng đúng nội dung mẫu |
| Playwright: đăng nhập, tạo môn qua UI, layout mobile | Đạt |
| Playwright: preview không ghi, ghi từng câu, nộp transcript/media, phát audio/video thật | Đạt |

## Phạm vi test

- Đăng nhập sai/đúng, refresh rotation, token cũ bị thu hồi, logout, Origin check, không echo mật khẩu trong lỗi validation.
- Phân quyền ADMIN/TEACHER/REVIEWER/STUDENT, bài được giao, bảo vệ session và evidence, không lộ rubric/expected concepts qua API sinh viên.
- Tài liệu → worker → chunks → truy xuất RAG theo môn/chủ đề/tập tài liệu; tài liệu hỏng chuyển FAILED và có retry.
- Blueprint → publish → snapshot giữ rubric cũ khi rubric được sửa.
- Chặn câu sai thứ tự, nộp khi chưa bắt đầu, nộp trùng khác key; retry cùng key an toàn.
- Hết giờ chặn câu mới, giữ transcript đến trễ và chuyển review; chưa đủ evidence không cho kết thúc.
- Upload chunk thiếu/hỏng checksum, complete lặp lại an toàn; Range playback và quyền truy cập.
- Server tính điểm theo trọng số; chặn điểm vượt rubric hoặc citation không tồn tại; AI timeout giữ transcript và tạo review.
- Browser ghi audio/video WebM thật bằng camera/mic giả lập; cả audio/video phát lại được ở màn hình giảng viên. STT được stub trong test browser để test ổn định.

## Chưa xác nhận bằng môi trường thật

- Gemini embedding/sinh câu hỏi/chấm với API key thật; độ chính xác/độ công bằng của điểm AI.
- Camera/microphone phần cứng và giọng nói tiếng Việt của sinh viên thật; Electron GUI trên Windows/macOS/Linux.
- 100 bài synthetic để qua Phase Gate, load test lớp học, mất mạng/crash và recovery.
- Chất lượng trên PDF scan (MVP không OCR), installer Electron ký số, cấu hình HTTPS theo domain cụ thể.

Docker daemon không có trên máy phát triển. Workflow `MVP checks` có job build image, khởi động Compose (PostgreSQL/Redis/MinIO/API/worker/web) và chạy browser E2E. Kết quả CI được cập nhật sau khi đẩy repository.
