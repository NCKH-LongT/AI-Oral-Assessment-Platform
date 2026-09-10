# Biên bản kiểm thử giai đoạn 1

## Bản mở rộng giáo trình & STT — 11/09/2026

| Hạng mục đã chạy                                                               | Kết quả                                                                           |
| ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------- |
| Ruff, TypeScript, ESLint, Electron syntax, `git diff --check`                  | Đạt                                                                               |
| 17 test API/audio/migration/seed trên SQLite                                   | Đạt                                                                               |
| 17 test trên PostgreSQL/pgvector trong Docker, database kiểm thử riêng         | Đạt                                                                               |
| Migration SQLite từ dữ liệu MVP có LO, topic, document, chunk; upgrade lặp lại | Giữ dữ liệu và ánh xạ, foreign key hợp lệ                                         |
| Migration database Compose hiện có lên `0002`                                  | Đạt; đã sao lưu database trước nâng cấp, giữ volume                               |
| Docker build API/worker/web và Compose health                                  | Đạt trên máy phát triển                                                           |
| Playwright trên Compose                                                        | 2/2 test đạt, đã mở rộng luồng kiến thức/STT/loading                              |
| Audio tổng hợp 48 kHz → giảm tiếng ù → WAV mono 16 kHz                         | Đạt; file gốc không đổi                                                           |
| Desktop Python: lọc nhiễu + Whisper tiny trên bản ghi JFK 11 giây              | Đạt; nhận dạng đúng nội dung mẫu tiếng Anh                                        |
| Electron Linux: mở cửa sổ → preload IPC → Python → lọc nhiễu → Whisper         | Đạt với file mẫu thật qua Playwright Electron; không dùng microphone phần cứng    |
| Google adapter                                                                 | Giả lập HTTP/auth: gửi đủ 120 giây thành 55 + 55 + 10 giây; chưa gọi dịch vụ thật |

Các trường hợp mới bao gồm nhiều LO/chương/tài liệu, chia bookmark/header, không truy xuất chương ngoài phạm vi, giữ snapshot sau sửa ánh xạ, cấm ánh xạ khác môn, cấm giáo trình thứ hai, sửa phạm vi trang, thay PDF lỗi và download có phân quyền. Có kiểm tra seed demo sau chuyển sang bảng liên kết.

STT policy được kiểm tra quyền admin, lưu/đọc cấu hình, yêu cầu desktop khi chọn local và định tuyến Google/server. Review job kiểm tra quyền, nộp đủ audio/video, chống bấm lặp lúc PENDING, checksum audio, lịch sử trước/sau, giữ transcript sinh viên, giữ đánh giá cũ khi Google lỗi và tạo lần thử mới.

Playwright kiểm tra upload PDF, chọn hai LO/hai chương/hai tài liệu, trang cấu hình có ba provider, layout mobile, spinner khi STT/nộp, khóa sửa transcript/ghi lại khi bận và phát WebM audio/video. Audio/video là bản ghi thật từ thiết bị giả lập Chromium; STT browser được stub để không phụ thuộc mạng/model. Ảnh: [kiến thức](screenshots/knowledge.png), [cấu hình STT](screenshots/speech-settings.png), [xem bài](screenshots/review.png).

Chưa xác nhận bằng credentials thật: Google Cloud STT, Gemini chấm và chất lượng tiếng Việt trong lớp có tạp âm. Bộ lọc giảm nhiễu không phải source separation; không bảo đảm tách được người khác nói chồng. Chưa kiểm tra Electron GUI Windows/macOS, microphone/camera phần cứng và tải đồng thời cả lớp. Playwright Electron sử dụng cấu hình khởi chạy kiểm thử của Playwright; không thay thế kiểm thử sandbox/installer production.

## Biên bản MVP ban đầu

Ngày kiểm tra: 10/09/2026. Chỉ ghi kết quả đã chạy; kiểm thử AI thật cần API key riêng.

| Hạng mục                                                                                 | Kết quả                                  |
| ---------------------------------------------------------------------------------------- | ---------------------------------------- |
| Python lint (Ruff)                                                                       | Đạt                                      |
| TypeScript typecheck                                                                     | Đạt                                      |
| ESLint web                                                                               | Đạt                                      |
| Next.js production build                                                                 | Đạt                                      |
| Electron main/preload syntax                                                             | Đạt                                      |
| npm audit sau cập nhật Next.js/Electron                                                  | 0 vulnerabilities tại thời điểm kiểm tra |
| 9 nhóm test API/unit/integration trên SQLite                                             | Đạt                                      |
| Cùng bộ test trên PostgreSQL 16 + pgvector 0.8.2                                         | Đạt                                      |
| Alembic upgrade → downgrade → upgrade trên PostgreSQL                                    | Đạt                                      |
| Compose parse/validation                                                                 | Đạt                                      |
| Docker build API/web + khởi động toàn bộ Compose trên GitHub Actions                     | Đạt                                      |
| Playwright trên Compose với PostgreSQL/Redis/MinIO thật                                  | 2/2 test đạt                             |
| Whisper tiny CPU: nhận dạng file giọng nói tiếng Anh thật                                | Đạt; nhận dạng đúng nội dung mẫu         |
| Playwright: đăng nhập, tạo môn qua UI, layout mobile                                     | Đạt                                      |
| Playwright: preview không ghi, ghi từng câu, nộp transcript/media, phát audio/video thật | Đạt                                      |

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

Ở lần kiểm tra MVP ban đầu, Docker chưa chạy trên máy phát triển; build/Compose được xác minh trên GitHub Actions. Hiện Docker Desktop đã hoạt động và bản mở rộng được kiểm tra cả local. Hai job `checks` và `compose-e2e` của bản MVP thành công trên commit `7d298b6`.

[CI đã chạy thành công: MVP checks #1](https://github.com/NCKH-LongT/AI-Oral-Assessment-Platform/actions/runs/34502364619). Bộ kiểm tra này gồm migration PostgreSQL, Ruff, 9 test API, TypeScript, ESLint, production build, Electron syntax, npm audit và 2 bài Playwright trên Docker Compose. STT bằng audio thật được kiểm tra riêng ở máy local; test trình duyệt stub STT và dùng Gemini demo.
