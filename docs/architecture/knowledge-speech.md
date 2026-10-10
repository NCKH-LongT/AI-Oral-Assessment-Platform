# Giáo trình, chủ đề và nhận dạng giọng nói

[README / danh mục tài liệu](../../README.md#hướng-dẫn-theo-nhu-cầu)

Tài liệu mô tả mô hình kiến thức, nhận dạng giọng nói và cấu hình AI. [Độ tin cậy và chấm lại theo phiên bản đề](grading-confidence.md) trình bày quy tắc kiểm tra snapshot và xử lý kết quả chấm.

## Mô hình kiến thức

Giữ một file PDF giáo trình ở cấp môn; không tạo bản sao vật lý cho từng chương. `Document.kind=TEXTBOOK` có unique index theo môn. Tài liệu bổ sung có `kind=SUPPLEMENT`. Giáo trình tối đa 100 MB, tài liệu bổ sung 20 MB; cấu hình bằng `MAX_TEXTBOOK_MB` và `MAX_DOCUMENT_MB`.

```mermaid
erDiagram
  Course ||--o| Textbook : has
  Textbook ||--o{ BookSection : contains
  Course ||--o{ Topic : contains
  Topic }o--o{ LearningOutcome : covers
  Topic }o--o{ BookSection : uses
  Topic }o--o{ SupplementDocument : references
```

- `book_sections`: tên, cấp tiêu đề 1–6, trang đầu/cuối, nguồn BOOKMARK/HEADING/FALLBACK/MANUAL.
- Ưu tiên bookmark PDF. Nếu thiếu, nhận dạng dòng `Chương`, `Chapter`, `Phần`, `Part`, hoặc đánh số `1.1`… Nếu không xác định được thì gợi ý toàn sách để giảng viên tự chia.
- Số trang là thứ tự trong PDF từ 1. Có thể sửa/thêm/xóa mục; không xóa mục còn được chủ đề tham chiếu. PDF scan cần OCR trước khi nhập.
- Chunk theo trang và ranh giới header nhận dạng được, tối đa 2400 ký tự; lưu trang, heading, document ID và embedding. Tối đa 2000 chunks/file. Liên kết chương dựa trên **phạm vi trang**, nên các mục bắt đầu chung trang có thể dùng chung nội dung trang đó.
- `topic_outcomes`, `topic_sections`, `topic_documents` là các bảng liên kết nhiều–nhiều. Kiểm tra tất cả ID cùng môn trên server; các FK ngăn xóa đối tượng đang dùng.
- UI tạo/sửa chủ đề yêu cầu ít nhất một LO và một chương/mục. Giáo trình qua chương đã chọn là một nguồn tài liệu; có thể gắn thêm nhiều tài liệu bổ sung. API hỗ trợ các mảng ID ánh xạ và trường `learning_outcome_id` đơn.
- Mỗi bản công bố lưu `topic_chunk_ids`, các ánh xạ LO/chương/tài liệu và câu hỏi trong snapshot. Chấm thường/chấm lại dùng đúng tập chunk này. Chỉnh ánh xạ hoặc trang chương chỉ ảnh hưởng đề công bố sau.
- Giáo trình READY được giữ bất biến. Nếu upload lỗi, có thể thay PDF tại mục **Thay PDF bị lỗi**; version tăng và worker xử lý lại.

## Pipeline giọng nói desktop

```mermaid
flowchart LR
  Mic[Microphone] --> Raw[Audio và video gốc]
  Raw --> Local[PhoWhisper-small hoặc Whisper-small INT8 trên desktop]
  Local --> Text[Transcript để học viên kiểm tra]
  Raw --> Server[Server lưu minh chứng]
  Text --> Server
  Server --> Grade[LLM chấm theo rubric và RAG]
  Grade --> Result[Kết quả trả về desktop]
  Server --> Review[Admin yêu cầu Gemini hoặc Google nhận dạng lại]
  Review --> Grade
```

Desktop dùng helper local với model và ngôn ngữ chọn trên thiết bị. Bộ cài chứa runtime, FFmpeg, PhoWhisper-small và Whisper-small đa ngôn ngữ, chạy CPU INT8. Helper chuyển audio gốc thành mono 16 kHz rồi nhận dạng. `STT_MODEL` điều khiển Whisper trên server; model desktop lấy từ tài nguyên đóng gói.

STT lần đầu và **Thử STT lại** trên desktop đều dùng audio gốc. Khi nộp, desktop upload audio/video gốc và transcript; worker chấm bất đồng bộ. Transcript nhập tay hoặc độ tin cậy thấp cần giảng viên kiểm tra. Lỗi AI, bài demo hoặc đang chờ chấm không được hiển thị thành điểm 0/10.

### Transcript và thuật ngữ

Người dùng kiểm tra và sửa transcript bằng tay trước khi nộp; mọi bản sửa được đánh dấu để giảng viên đối chiếu với audio.

AI gợi ý thuật ngữ tiếng Anh và nghĩa tiếng Việt cùng lúc sinh câu hỏi, lưu trong snapshot đề và hiển thị ở workspace giảng viên. Không tự sửa transcript hoặc tự truyền gợi ý vào STT.

### LLM và cấu hình

`AI_CONFIG_SOURCE=env` là mặc định: `AI_PROVIDER`, `LLM_MODEL`, `EMBEDDING_MODEL`, `GEMINI_API_KEY` lấy từ môi trường API/worker. `AI_PROVIDER=local` dùng Ollama qua `LOCAL_LLM_URL`, JSON schema cho câu hỏi/chấm và embedding 768 chiều. `gemini` dùng Gemini API; `demo` chỉ thử quy trình, không tạo điểm chính thức. `AI_CONFIG_SOURCE=admin` cho phép quản trị AI trên web và lưu cấu hình trong `platform.json`. Adapter thêm prefix truy vấn/tài liệu khi dùng `nomic-embed-text` theo [model card](https://huggingface.co/nomic-ai/nomic-embed-text-v1.5); cần đánh giá retrieval trên giáo trình tiếng Việt trước khi chọn model embedding triển khai.

Đổi AI provider/model cần xử lý lại tài liệu và công bố đề mới, vì snapshot đề và embedding có phiên bản. Provider STT được chọn độc lập với LLM chấm bài: Gemini có thể nhận dạng trên web theo policy hoặc nhận dạng lại audio khi admin yêu cầu.

### Nhận dạng lại có lịch sử — Gemini hoặc Google Cloud STT

Admin chọn nhà cung cấp cho mỗi lần review: `/gemini-review` dùng Gemini API key; `/google-review` dùng JSON service account. Cả hai endpoint chỉ ADMIN, yêu cầu lý do, câu đã chấm trong bài đã nộp và audio upload hoàn tất. Dùng `GEMINI_API_KEY` + `GEMINI_STT_MODEL`, không cần service-account JSON. Có thể dùng khi LLM chấm chạy Ollama.

Job lưu trong database, nhận dạng từ audio gốc đã kiểm tra checksum. WAV được chia đoạn 55 giây để gửi Gemini inline audio; giữ toàn bộ phần cuối. Không tự đổi provider khi lỗi. Worker dùng transcript mới và snapshot đề để chấm, lưu lịch sử trước/sau và audit; không ghi đè transcript đã nộp hoặc media gốc. Job lỗi giữ kết quả trước đó. Yêu cầu trùng khi đang chờ trả cùng ID.

Gemini không trả acoustic confidence tương đương Whisper: adapter đánh dấu `confidence_source=unavailable` và độ tin cậy STT bằng 0, vì vậy kết quả cần giảng viên kiểm tra, không tự công nhận điểm dựa trên một confidence giả.

### Trình duyệt và credentials

Cấu hình STT trên web chọn `local` (yêu cầu desktop), `local_server` (Whisper trong API), `gemini` hoặc `google`, cùng ngôn ngữ `vi`/`en`. Policy đã lưu ưu tiên hơn `STT_PROVIDER`; desktop dùng model/ngôn ngữ chọn trên thiết bị và luôn nhận dạng local. Audio nhận dạng tối đa 600 giây, request tối đa 30 MB. Trình duyệt web giữ gain, thu thử 10 giây trước thi và tùy chọn RNNoise (mặc định tắt), cùng lựa chọn bản gốc/bản lọc khi nhận dạng lại. RNNoise chỉ ảnh hưởng nhánh audio STT, không thay bản media minh chứng; không tách được chắc chắn người khác nói chồng. Xem [luồng audio desktop/web](crud-noise-check.md).

Google Cloud STT là lựa chọn được hỗ trợ trên giao diện: admin upload JSON qua `/admin/settings/speech/google-credentials`. File riêng quyền 600, không trả private key hoặc chuyển xuống desktop; upload không đổi policy hoặc LLM. Thiếu key Gemini/JSON Google chỉ chặn provider tương ứng. Job đang chờ bằng provider khác trả 409 khi admin yêu cầu đổi provider; không tạo hai job song song hoặc âm thầm dùng nhầm provider.

Nguồn: [PhoWhisper](https://github.com/VinAIResearch/PhoWhisper), [RNNoise Web Audio](https://github.com/sapphi-red/web-noise-suppressor), [Ollama structured outputs](https://docs.ollama.com/capabilities/structured-outputs), [Gemini audio](https://ai.google.dev/gemini-api/docs/audio).
