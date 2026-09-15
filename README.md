# OralAI — Thi vấn đáp và chấm điểm AI

Ứng dụng web và desktop cho phép ghi câu trả lời, chuyển giọng nói thành text bằng Whisper, rồi dùng Gemini chấm theo rubric và tài liệu môn học. Audio/video được lưu làm minh chứng.

## Chạy nhanh

Cần Docker Compose và Python 3. Chạy tại thư mục gốc repository:

```bash
python3 scripts/setup_env.py
docker compose up -d --build --wait
```

Mở **http://localhost:3000**, đăng nhập bằng `BOOTSTRAP_ADMIN` và `BOOTSTRAP_PASSWORD` trong `.env`. Script không ghi đè `.env` đã có. Mặc định hệ thống chạy demo, chưa chấm AI.

## Dùng Gemini chấm điểm + Whisper nhận dạng

Hai cấu hình này **độc lập**:

| Chức năng                                     | Cấu hình                                               | Cần gì?                              |
| --------------------------------------------- | ------------------------------------------------------ | ------------------------------------ |
| Sinh câu hỏi, embedding tài liệu và chấm text | **AI & mô hình → Google Gemini**                       | Gemini API key                       |
| Nhận dạng trên máy học viên                   | **STT & giọng nói → Whisper local trên máy sinh viên** | Desktop + Whisper local              |
| Nhận dạng trên máy chủ                        | **STT & giọng nói → Whisper trên server nội bộ**       | Whisper trong API; Docker đã cài sẵn |
| Nhận dạng bằng Google Cloud (tùy chọn)        | **STT & giọng nói → Google Cloud Speech-to-Text**      | JSON service account riêng           |

**Gemini + Whisper không cần JSON Google STT.** Luồng xử lý: ghi âm → Whisper → transcript → Gemini chấm điểm. Khi nộp bài, worker chấm transcript đã gửi, không gọi Google STT để nhận dạng lại.

Admin mở **Cấu hình hệ thống**:

1. Tab **AI & mô hình**: chọn **Google Gemini**, nhập API key và lưu.
2. Tab **STT & giọng nói**: chọn một trong hai lựa chọn **Whisper**, chọn ngôn ngữ/lọc nhiễu và bấm **Lưu cấu hình STT**.
3. Xử lý tài liệu, tạo rubric và công bố đề mới với cấu hình Gemini.

Nếu STT trước đó đã chọn Google, cần đổi và lưu lại ở bước 2. Bật Gemini không tự đổi lựa chọn STT đã lưu. Mục JSON Google chỉ dùng khi chủ động chọn Google STT hoặc dùng chức năng **Nhận dạng lại bằng Google & chấm lại**.

Có thể đặt cấu hình ban đầu trong `.env`:

```dotenv
AI_PROVIDER=gemini
GEMINI_API_KEY=your-api-key
STT_PROVIDER=local
STT_MODEL=base
STT_LANGUAGE=vi
```

`STT_PROVIDER=local` dùng Whisper trên desktop; `local_server` dùng Whisper trên API (mặc định); `google` dùng Google STT. `STT_MODEL` trên server điều khiển Whisper server; Whisper desktop đọc biến này trên máy học viên.

**Cấu hình đã lưu trên web được ưu tiên hơn `.env`**: AI lưu trong `DATA_DIR/secrets/platform.json`, STT lưu trong database. Với hệ thống đã cấu hình, sửa trên web để có hiệu lực ở lần xử lý tiếp theo. Nếu dùng `.env`, nạp lại bằng:

```bash
docker compose up -d --no-deps --force-recreate api worker
```

Đề đã công bố giữ cấu hình AI và rubric cũ. Đề demo không tự chuyển thành đề Gemini; tài liệu cần xử lý lại khi đổi model embedding. Bài luyện tập mặc định không tính điểm.

## Mở app desktop

Cần Node.js **22.12+** và giao diện đồ họa. Tại thư mục gốc:

```bash
npm ci
env -u ELECTRON_RUN_AS_NODE npm run desktop
```

Với Whisper local, chuẩn bị Python trước khi mở app (Linux/macOS):

```bash
python3.12 -m venv .venv
.venv/bin/pip install "faster-whisper>=1.1,<2" "imageio-ffmpeg>=0.6,<0.7"
ORAL_PYTHON="$PWD/.venv/bin/python" env -u ELECTRON_RUN_AS_NODE npm run desktop
```

Whisper tải model ở lần chạy đầu. Máy học viên dùng Whisper server không cần Python. Đổi server tại **OralAI → Cấu hình máy chủ…**; dùng `http://localhost:3000` hoặc domain HTTPS, không thêm `/api`.

Hướng dẫn Windows, bộ cài và kết nối server: [Desktop](readme-desktop.md).

## Quy trình sử dụng

1. Admin tạo tài khoản, môn học và giao môn cho học viên.
2. Giảng viên tải tài liệu, tạo chủ đề/chuẩn đầu ra, rubric và đề thi; công bố rồi giao bài.
3. Học viên kiểm tra camera/mic, ghi âm, kiểm tra transcript và nộp bài sau khi audio/video tải lên xong.
4. Worker chấm bài; giảng viên xem kết quả, transcript và minh chứng. Điểm chưa xác nhận hiển thị chờ chấm hoặc cần xem lại.

## Cập nhật và xử lý lỗi

Sau khi cập nhật source:

```bash
docker compose up -d --build --wait
```

Tải lại web hoặc mở lại desktop. Giữ volume dữ liệu; không dùng `docker compose down -v` nếu cần giữ bài thi.

| Hiện tượng                              | Cách kiểm tra                                                                            |
| --------------------------------------- | ---------------------------------------------------------------------------------------- |
| Gemini đã bật nhưng STT đòi JSON Google | Vào STT & giọng nói, đổi nhà cung cấp đang lưu sang Whisper rồi lưu lại                  |
| Bài không có điểm                       | Kiểm tra đề có phải demo/luyện tập, trạng thái cần xem lại và log worker                 |
| Chờ chấm mãi                            | `docker compose ps` và `docker compose logs --tail=100 worker`                           |
| Whisper nhận dạng lỗi                   | Kiểm tra microphone, FFmpeg, model và khả năng tải model; desktop cần đúng `ORAL_PYTHON` |
| Thay `.env` nhưng không đổi cấu hình    | Kiểm tra cấu hình đã lưu trên web; `restart` không nạp biến môi trường mới               |

## Phát triển và tài liệu

Stack: Next.js, Electron, FastAPI, PostgreSQL/pgvector và MinIO. Source chính ở `apps/admin-web`, `apps/desktop`, `services/api`.

```bash
python3.12 -m venv .venv
.venv/bin/pip install -r services/api/requirements.lock
.venv/bin/pip install --no-deps -e services/api
npm ci
.venv/bin/python -m pytest services/api/tests -q
npm run lint
npm run typecheck
npm run build
```

- [Chạy và cấu hình desktop](readme-desktop.md) · [Build bộ cài](docs/desktop-build.md)
- [Thiết kế kiến thức và STT](docs/architecture/knowledge-speech.md)
- [Tài khoản, đăng nhập Google và giao môn](docs/architecture/accounts-courses-desktop.md)
- [Kiến trúc](docs/architecture/phase-1.md) · [Kiểm thử](docs/validation.md)
