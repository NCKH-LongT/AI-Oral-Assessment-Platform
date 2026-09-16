# OralAI — Thi vấn đáp

Desktop ghi audio/video, lọc nhiễu RNNoise và nhận dạng **PhoWhisper-small cục bộ**. Server nhận media gốc + transcript, chấm theo rubric/RAG bằng **Ollama local hoặc Gemini**, rồi trả kết quả cho app.

## Chạy server

Cần Docker Compose và Python 3. Tại thư mục gốc:

```bash
python3 scripts/setup_env.py
# Sửa cấu hình LLM trong .env trước khi dùng chấm thật.
docker compose up -d --build --wait
```

Mở **http://localhost:3000**, đăng nhập bằng `BOOTSTRAP_ADMIN` / `BOOTSTRAP_PASSWORD` trong `.env`. Mặc định `AI_PROVIDER=demo` chỉ thử quy trình, không chấm điểm.

## Chọn LLM qua .env

**Gemini:**

```dotenv
AI_CONFIG_SOURCE=env
AI_PROVIDER=gemini
GEMINI_API_KEY=your-key
LLM_MODEL=gemini-2.5-flash
EMBEDDING_MODEL=gemini-embedding-001
```

**Ollama chạy local trên server:** tải sẵn một model chat hỗ trợ JSON schema và model embedding **768 chiều**, ví dụ `qwen3:8b` và `nomic-embed-text`:

```bash
ollama pull qwen3:8b
ollama pull nomic-embed-text
```

```dotenv
AI_CONFIG_SOURCE=env
AI_PROVIDER=local
LOCAL_LLM_URL=http://host.docker.internal:11434
LOCAL_LLM_TIMEOUT=180
LLM_MODEL=qwen3:8b
EMBEDDING_MODEL=nomic-embed-text
```

Ollama phải lắng nghe tại địa chỉ API/worker truy cập được. Docker dùng `host.docker.internal` để tới host; chạy API native thì dùng `http://127.0.0.1:11434`. Đặt Ollama trong mạng nội bộ. Không dùng `localhost` trong container để trỏ tới host.

Sau khi đổi `.env`:

```bash
docker compose up -d --no-deps --force-recreate api worker
```

`AI_CONFIG_SOURCE=env` ưu tiên cấu hình AI trong `.env`, bỏ qua AI cũ lưu trên web. `admin` chỉ dành cho triển khai cũ muốn tiếp tục chỉnh AI trên web. OAuth và cấu hình ngôn ngữ STT vẫn chỉnh trên web. Đề đã công bố giữ snapshot AI/rubric; đổi provider/model thì xử lý lại tài liệu và công bố đề mới.

## Desktop và kiểm tra mic

Đang sửa source trên Linux/macOS: chạy **`./run-desktop.sh`**. Script chỉ mở UI dev cổng 3001 và Electron, dùng server bạn đã chạy tại localhost:3000; không gọi Docker. Sửa giao diện tự cập nhật. Cần bundle STT đã build; xem [hướng dẫn](readme-desktop.md).

Cài bộ OralAI từ workflow **Desktop installers**. Bộ cài chứa **PhoWhisper-small INT8, runtime STT và FFmpeg**; máy học viên không cần Python, không tải model ở lần chạy đầu. App vẫn cần kết nối server để đăng nhập, lấy đề, nộp bài và nhận điểm.

1. Chọn server tại **OralAI → Cấu hình máy chủ…**.
2. Mở bài, cấp quyền và chọn microphone/camera trong danh sách **Chọn thiết bị**.
3. Bấm **Kiểm tra độ ồn**: giữ im lặng 3 giây đầu, nói thử 7 giây sau.
4. Phát lại bản thử, bật/tắt **Nghe bản đã lọc nhiễu RNNoise** để so sánh. Bản thử không upload.
5. Chọn bật/tắt **Lọc nhiễu RNNoise khi nhận dạng câu trả lời**, bắt đầu thi, kiểm tra transcript rồi nộp.

Desktop luôn chạy STT local; lựa chọn STT trên server chỉ điều khiển đường nhận dạng của trình duyệt web. Media gốc được lưu riêng, không thay bằng bản đã lọc. Worker xử lý bất đồng bộ; app tự cập nhật điểm hoặc trạng thái cần xem lại.

## Admin chọn STT trên server

Trong **Cấu hình hệ thống → STT & giọng nói**, admin có thể chọn Gemini hoặc Google Cloud STT cho trình duyệt web. Desktop vẫn nhận dạng local.

Khi xem kết quả, mở **Nhận dạng lại & chấm lại**, chọn nhà cung cấp và nhập lý do:

- **Gemini STT:** dùng API key và model trong `.env`:

```dotenv
GEMINI_API_KEY=your-key
GEMINI_STT_MODEL=gemini-2.5-flash
```

- **Google Cloud STT:** mở mục cấu hình JSON trong tab STT, upload service-account JSON hợp lệ (tối đa 64 KB). Cần bật Speech-to-Text API, billing và cấp quyền cho tài khoản. Upload không tự đổi nhà cung cấp.

Nhận dạng lại dùng audio gốc và hoạt động cả khi `AI_PROVIDER=local`. Nhà cung cấp đã chọn nhận dạng, còn LLM chấm vẫn theo snapshot đề. **Chỉ Google Cloud STT cần JSON; Gemini không cần.** Giữ transcript đã nộp và lịch sử trước/sau. Gemini không trả độ tin cậy âm học nên kết quả này cần giảng viên kiểm tra trước khi công nhận điểm.

## Build, cập nhật và tài liệu

Build desktop cần chuẩn bị bundle STT trước; xem [hướng dẫn desktop](readme-desktop.md) và [đóng gói](docs/desktop-build.md). Không đưa binary/model hoặc `.env` vào Git.

`Jenkinsfile` build/kiểm tra/deploy web và API; bộ cài desktop dùng workflow riêng. Nếu deploy bằng Jenkins, đồng bộ các biến mới trong credential `oral-ai-env`.

Cập nhật server: `docker compose up -d --build --wait`, sau đó mở lại desktop. Không xóa volume dữ liệu. Kiểm tra chờ chấm/lỗi bằng `docker compose logs --tail=100 worker`.

```bash
.venv/bin/python -m pytest services/api/tests -q
npm run lint
npm run typecheck
npm run build
npm run test:audio
npm run test:desktop
```

- [Kiến trúc STT/LLM](docs/architecture/knowledge-speech.md)
- [Kiểm tra mic và lọc nhiễu](docs/architecture/crud-noise-check.md)
- [Tài khoản và OAuth](docs/architecture/accounts-courses-desktop.md)
- [Biên bản kiểm thử](docs/validation.md)
