# Biên bản kiểm thử giai đoạn 1

## Nhiều lần làm bài và quản lý kết quả — 17/09/2026

- Suite backend: 53 test đạt trên SQLite, 1 test khóa PostgreSQL bỏ qua; 54 test đạt trên PostgreSQL/pgvector với database tạm riêng. Bao gồm giới hạn, không giới hạn, cấp thêm lượt riêng, giảm giới hạn, phân quyền, lịch sử và snapshot không đổi.
- Năm test retake chạy lại trên PostgreSQL đạt, gồm bốn request tạo lần thi đồng thời trả về cùng một phiên, từ chối xóa khi worker đang giữ khóa, xóa đúng câu trả lời/media, thu hồi quyền truy cập và giữ số lần tăng sau xóa. Giả lập storage lỗi rồi worker thử lại thành công.
- Migration trên dữ liệu cũ đạt ở SQLite và PostgreSQL: giữ điểm 8 và transcript mẫu, gán lần 1, cho tạo lần 2; chạy upgrade lặp lại an toàn. Không migration database ứng dụng đang chạy.
- Năm kịch bản Playwright đạt: hai kịch bản quản lý lượt/lịch sử cho admin và sinh viên, ba kịch bản STT desktop cũ. Kiểm tra chọn cả ba chính sách, chuyển lịch sử, cấp lượt, hủy/xác nhận xóa đúng lần, mở kết quả cũ và yêu cầu lần mới. API được giả lập trong E2E; quy tắc dữ liệu và khóa được kiểm tra bằng suite backend PostgreSQL.
- Ruff, ESLint, TypeScript và Next production build đạt. Thay đổi này không gọi Gemini/Ollama thật và không thay model STT.

## Chọn bản STT, tên thiết bị và sửa chính tả local — 17/09/2026

- Tái hiện trên Electron thật: `setPermissionCheckHandler` nhận origin `http://localhost:3001/`, code so với `http://localhost:3001` nên không cấp quyền liệt kê tên. Sau khi chuẩn hóa origin, đọc được UGREEN HiTune Max5c, UGREEN Camera 4K Analog Stereo, Built-in Audio Analog Stereo và camera UGREEN từ chính PC Linux; không dùng thiết bị giả ở kiểm tra tên này.
- Ba kịch bản E2E ghi câu trả lời đạt: bật/tắt lọc ban đầu, đổi nguồn và thử STT lại, RNNoise không tải được, STT retry lỗi giữ transcript. So SHA-256 đầu vào STT chứng minh chọn đúng Blob, lần upload AUDIO luôn dùng hash bản gốc. STT được giả lập, MediaRecorder/RNNoise chạy thật với mic/camera Chromium giả lập.
- E2E còn kiểm tra tải model lỗi rồi thử lại, so sánh/giữ/áp dụng đề xuất, model lỗi giữ transcript, nộp bản chỉnh sửa với confidence 0 để đối chiếu. Một kịch bản chọn thiết bị và bốn kịch bản thu thử/phát lại 10 giây đều đạt (tổng 8 kịch bản E2E liên quan).
- Sáu unit test desktop đạt: domain, quyền media, checksum/cache offline/atomic download, hủy tải, chia đoạn không mất chữ, giới hạn đầu vào và chặn thay số liệu. Hai unit test audio, Next production build, ESLint, TypeScript, Electron syntax và `git diff --check` đạt; npm audit không báo lỗ hổng.
- Tải Qwen3 1.7B Q4_K_M 1.282.439.264 byte theo revision ghim, xác nhận SHA-256. Runtime CPU chạy thật, sửa mẫu “lập chình và cơ sỡ dữ liệu” thành “lập trình và cơ sở dữ liệu”. Linux `npm run pack -w apps/desktop` đạt; gọi correction qua preload/IPC ở cả source và bản đóng gói, chặn `fetch` trong main process, vẫn sửa được mẫu (khoảng 5 giây gồm nạp model). Model test lưu trong profile dev, không đưa vào Git.

Chưa benchmark WER/CER hoặc chất lượng sửa chính tả trên bộ dữ liệu tiếng Việt; chưa kiểm thử runtime sửa chính tả trên Windows/macOS. Không gọi LLM server/Gemini trong kiểm tra này và không thay Docker đang chạy.

## Google login qua desktop dev — 17/09/2026

- Xác nhận backend cấu hình domain gốc `http://localhost:3000`, trong khi launcher mở UI ở 3001; kiểm tra origin cũ trong IPC từ chối URL đăng nhập hợp lệ. Launcher nay truyền origin backend riêng cho Google login khi chạy source.
- Hai test Node đạt, gồm chấp nhận URL đăng nhập trên server được cấu hình và từ chối domain/cổng khác, credentials, endpoint sai, thiếu flow và fragment. Electron syntax, ba test launcher Python, Ruff và `git diff --check` đạt.
- Chạy Electron thật với profile tạm cho cả chế độ cùng origin và UI/backend khác origin; gọi IPC qua preload thành công với URL hợp lệ, chặn URL sai. `shell.openExternal` được giả lập để kiểm tra đích mở mà không mở tài khoản Google thật. Chưa hoàn tất đăng nhập với tài khoản Google của người dùng.

## Chạy lại desktop sau khi đóng — 17/09/2026

- Tái hiện báo nhầm cổng bận: socket kiểm tra không đặt `SO_REUSEADDR` từ chối bind khi kết nối server vừa đóng còn `TIME_WAIT`, dù không còn tiến trình lắng nghe. Sửa phép kiểm tra theo cách Node mở TCP server; vẫn từ chối listener đang chạy.
- Ba test Python đạt: cổng trống, listener đang chạy, khởi động lại ngay sau khi đóng kết nối. Đưa test vào CI; Ruff, Bash syntax và `git diff --check` đạt.
- Chạy launcher/Electron thật hai lần liên tiếp, đóng bằng SIGINT giữa hai lần: giao diện trả 200, API qua UI dev trả `status: ok`, launcher thoát 0, không còn listener cổng 3001 sau khi đóng.
- Restart Docker API/worker/web theo yêu cầu; API/web healthy, worker running, health ở cổng 3000 trả `status: ok`. Launcher vẫn không chạy Docker.

## Chọn microphone và camera — 17/09/2026

- Thêm hai danh sách thiết bị ở bước kết nối, cập nhật khi cắm/rút và sau khi cấp quyền. Chọn thiết bị kết nối ngay, dừng luồng cũ và đặt lại kết quả kiểm tra mic.
- Playwright: kiểm tra chọn đúng `deviceId`, từ chối quyền rồi kết nối lại, rút camera và chọn thiết bị thay thế; phép đo 10 giây dùng đúng mic đã chọn. Kiểm tra khóa danh sách khi ghi và nộp transcript STT local đạt.
- Bốn kiểm thử độ ồn/phát bản gốc và RNNoise đạt. Tổng cộng 6 kiểm thử E2E liên quan đạt; API và danh sách thiết bị giả lập, MediaRecorder/RNNoise chạy thật trong Chromium. Chưa thử chọn giữa các microphone/camera phần cứng.
- Next production build, ESLint, TypeScript và `git diff --check` đạt. Không thay đổi hoặc khởi động Docker.

## Launcher chỉ chạy desktop — 17/09/2026

- Loại bỏ Docker Compose, tạo `.env`, cài dependency và thay cấu hình server khỏi launcher. UI dev/Electron kết nối server có sẵn qua `--server` (mặc định localhost:3000).
- Chạy thử launcher với lệnh Docker/npm bị thay bằng chương trình luôn báo lỗi: UI dev và Electron vẫn mở được. Khi đóng Electron, dev server dừng. Server chưa sẵn sàng được báo rõ và không tự khởi động dịch vụ.
- Ruff, Bash syntax và CLI help đạt. Backend cần cho phép origin dev qua `ALLOWED_ORIGINS`; người vận hành tự cấu hình, launcher không sửa.


## Launcher desktop từ source và nút nghe thử mic — 17/09/2026

- Kiểm tra web Docker tại localhost:3000 và Electron: code trước thay đổi đã phát được raw/RNNoise sau 10 giây với mic giả lập; chưa tái hiện được lỗi mất bản ghi trên mic của người dùng.
- Thêm `run-desktop.sh`: rebuild Compose, thêm origin dev qua override, mở Next dev cổng riêng và Electron profile riêng. Đã chạy script thật, kiểm tra health và request đăng nhập từ origin dev (401 với tài khoản giả, không bị 403 do origin); cổng bận được từ chối.
- Đã sửa tạm một nhãn trong source rồi khôi phục, xác nhận cả hai thay đổi hiện ngay trong Electron qua HMR mà không restart. Đã dừng phiên thử và kiểm tra giải phóng dev server.
- Phần nghe thử luôn hiển thị sau cấp quyền mic, có nút Phát bản gốc/Phát bản đã lọc nhiễu và cuộn đến bản ghi khi hoàn tất. Bốn test Playwright mic đạt trên dev server; kiểm tra RNNoise và playback thật trong Electron với mic giả lập đạt. Next production build, ESLint, TypeScript, Ruff và Bash syntax đạt.


## Admin chọn Gemini / Google Cloud STT — 17/09/2026

- 49 test backend đạt: Gemini là provider STT web hợp lệ; thiếu API key chỉ chặn Gemini, thiếu JSON chỉ chặn Google; cả hai endpoint review giữ quyền ADMIN và lịch sử. Chặn đổi provider khi job khác đang chờ.
- 7 kiểm thử Playwright liên quan đạt: chọn Gemini/Google cho từng review, upload JSON không tự đổi policy hoặc làm mất lựa chọn chưa lưu, lưu cả hai provider cloud, chuyển về local không cần JSON, desktop luôn local dù policy server là Google. Các request cloud/JSON trong E2E được giả lập; kiểm tra JSON/quyền backend dùng suite API.
- Ruff, TypeScript, ESLint và Next production build đạt. Không thay helper/model desktop trong lần cập nhật này; không gọi dịch vụ cloud có tính phí. Hướng dẫn build, chạy lại source, cài đè và workflow desktop đã cập nhật.


## STT desktop offline, RNNoise và LLM server — 17/09/2026

- 49 test backend đạt trên SQLite: cấu hình env ưu tiên hơn AI cũ trên web; không ghi key AI từ env vào cấu hình web; Ollama sinh câu hỏi/embedding/chấm transcript; điểm không hợp lệ chuyển sang cần xem lại; Gemini nhận dạng lại không gọi service-account JSON, chia audio 55 giây, kiểm tra quyền/idempotency, giữ transcript/media gốc và giữ kết quả cũ khi lỗi. Request Ollama/Gemini được giả lập.
- 19 kịch bản Playwright đạt trên Next production với API/worker và database kiểm thử riêng, gồm CRUD, giao môn/OAuth, nộp/phát lại WebM thật, STT desktop luôn local dù policy cũ là Google, trạng thái điểm chưa chấm, 10 giây thu thử và playback gốc/RNNoise. Kịch bản nộp bài được chạy lại sau khi cập nhật expectation cho trạng thái nhận dạng mới. Mic/camera giả lập; RNNoise WASM/AudioWorklet chạy thật.
- Build bundle native Linux x64 thành công từ revision PhoWhisper-small đã ghim; helper `--check` nạp model offline. Nhận dạng audio mẫu 11 giây bằng helper thành công, xác nhận cả VAD và FFmpeg chạy được.
- Tạo được `.deb` và `.AppImage` Linux có helper/model; model INT8 khoảng 240 MB, runtime khoảng 453 MB trước nén. Mở Electron đã đóng gói qua Playwright với profile tạm, gọi IPC từ renderer đến helper đóng gói, nhận transcript và metadata `PhoWhisper-small` thành công. Không dùng Python bên ngoài cho đường gọi này.
- Ruff, ESLint, TypeScript, Next production build, Electron syntax, 2 unit test audio và 1 unit test domain desktop đạt. `npm audit --audit-level=high` báo 0 vulnerabilities tại thời điểm kiểm tra.
- `.env` đã bổ sung các khóa còn thiếu theo `.env.example`, giữ giá trị sẵn có và không đưa vào Git. Không chạy migration mới hoặc cập nhật deployment đang dùng dữ liệu thật.

Chưa benchmark tiếng Việt với transcript chuẩn, chưa thử microphone phần cứng, chưa chạy Gemini/Ollama thật cho bản thay đổi này. Chưa kiểm tra bundle mới trên Windows/macOS; workflow đã bắt buộc build cả runtime và model trên OS đích. Các biên bản bên dưới là lịch sử, không mô tả luồng STT hiện hành.


## Google login, giao môn, cấu hình web và desktop — 13/09/2026

- 30 test API/audio/migration đạt trên SQLite và PostgreSQL/pgvector. Test PostgreSQL dùng database riêng; E2E dùng Compose project `oral-accounts-check`, không dùng volume dữ liệu đang chạy.
- Kiểm tra Google state/nonce, ID token audience, email đã xác minh, chống dùng lại callback/poll token, callback đang xử lý, không tự ghép tài khoản mật khẩu; request Google được giả lập, chưa đăng nhập với OAuth client thật.
- Kiểm tra quyền ADMIN hiện hành, bảo vệ admin ACTIVE cuối cùng; giao/gỡ môn, đề công bố sau khi giao môn, chặn đề nháp; bootstrap môn mặc định idempotent và mọi vai trò có thể thi thử.
- Kiểm tra cấu hình AI/OAuth/STT chỉ cho ADMIN, che secret trong response, quyền file 600, xóa key rõ ràng, request/job giữ cấu hình nhất quán. Bảy test tài khoản/cấu hình được chạy lại sau điều chỉnh đọc cấu hình mới khi lưu.
- Tám kịch bản Playwright đạt trên Docker: Google desktop giả lập, bốn tình huống tiếng ồn, admin CRUD/UI, sinh viên nộp/phát lại WebM, giao môn/đổi quyền/cấu hình secret. Sau khi bổ sung popup chương/chủ đề, kịch bản admin được chạy lại và đạt.
- Ruff, ESLint, TypeScript, Next.js production build trong Docker, Electron syntax, hai unit test audio, unit test domain desktop và npm audit đạt (0 vulnerabilities được báo cáo tại thời điểm kiểm tra).
- CI trước đó lỗi pull `minio/minio` từ Docker Hub trên runner mới ([log CI](https://github.com/NCKH-LongT/AI-Oral-Assessment-Platform/actions/runs/34739076717)). Compose chuyển sang cùng bản `RELEASE.2025-09-07T16-13-09Z` trên Quay và ghim manifest digest; không nâng phiên bản storage hoặc đổi volume.
- Docker API/worker/web đã rebuild và Compose đang chạy được cập nhật sau khi sao lưu PostgreSQL. Migration lên `0003` thành công: giữ 5 tài khoản, 4 phiên thi; số môn 7 → 8 và đề 4 → 5 do thêm môn/đề luyện tập. Health API/web đạt; credentials Google STT trên volume vẫn đọc được.
- Electron đóng gói Linux: mở app/kết nối backend, preload Google, menu cấu hình local, kiểm tra health và tách quyền IPC. Kiểm tra lần đầu chưa có cấu hình → lưu domain → mở trang đăng nhập → đóng/mở app giữ domain thành công; xác nhận đổi máy chủ native được giả lập trong kiểm thử Playwright.
- Đã build `.deb` và `.AppImage` Linux x64 bằng electron-builder. [Desktop installers #34741414321](https://github.com/NCKH-LongT/AI-Oral-Assessment-Platform/actions/runs/34741414321) đạt cả ba job trên OS đích: Windows x64 (NSIS), Linux x64 (deb/AppImage), macOS ARM64 (dmg/zip); chưa kiểm tra GUI, microphone/camera phần cứng, code signing/notarization hoặc helper Whisper PyInstaller trên các OS này.

[CI #34741506218](https://github.com/NCKH-LongT/AI-Oral-Assessment-Platform/actions/runs/34741506218) trên commit `b0a5ad5` đạt cả `checks` và `compose-e2e`, xác nhận pull MinIO trên runner mới, migration, 30 test API và 8 kịch bản Playwright.

Ảnh giao diện mới: [môn học/chủ đề](screenshots/knowledge.png), [cấu hình](screenshots/speech-settings.png). Hướng dẫn: [tài khoản và giao môn](architecture/accounts-courses-desktop.md), [build desktop](desktop-build.md).

## CRUD và kiểm tra tiếng ồn — 13/09/2026

- 23 test API/audio/migration đạt trên SQLite và PostgreSQL/pgvector. PostgreSQL chạy trên database kiểm thử riêng; dữ liệu E2E ở Compose project `oral-crud-check`, tách volume khỏi ứng dụng đang chạy.
- Kiểm tra tạo/đọc/sửa/xóa môn trống, archive/restore, quyền ADMIN/giảng viên/REVIEWER/STUDENT, lỗi 409 khi môn/rubric còn tham chiếu; CRUD rubric và đề nháp; từ chối chuyển môn, sửa/xóa đề đã công bố; bản sao không có assignment/snapshot và không thay đổi đề gốc.
- Hai unit test âm thanh đạt: RMS/dBFS, phòng yên lặng/ồn, nhiễu ngắt quãng, đột biến đơn lẻ, không tín hiệu và dữ liệu không hợp lệ.
- Sáu kịch bản Playwright trên Docker Compose đạt: bốn tình huống tiếng ồn (yên lặng; ồn rồi kiểm tra lại; bỏ qua khi đang đo; tín hiệu bằng 0), luồng admin CRUD/kiến thức/cấu hình và luồng sinh viên ghi/nộp/phát lại WebM. Bộ chọn ô rubric trong test được sửa rồi kịch bản admin được chạy lại thành công.
- Electron Linux mở qua Playwright: bridge desktop hoạt động, cảnh báo phòng ồn và khóa bắt đầu; kiểm tra lại phòng yên lặng cho bắt đầu; bỏ qua trong lúc đo; các track kiểm tra được giải phóng, số lần gọi MediaRecorder bằng 0. Chạy với camera/mic giả lập và PCM tổng hợp, không phải đo microphone phần cứng.
- Ruff, ESLint, TypeScript, production build, Electron syntax và `git diff --check` đạt; `npm audit --audit-level=high` không có lỗ hổng được báo cáo. Docker build API/worker/web và health check Compose thử nghiệm đạt.
- Đã sao lưu PostgreSQL trước cập nhật, recreate API/worker/web của Compose đang chạy, giữ các volume hiện có. Sau cập nhật API/web/PostgreSQL/Redis healthy, worker running, `http://localhost:3000/api/health` trả `status: ok`. Không có migration schema mới.

Ngưỡng −40 dBFS/20% là heuristic chưa hiệu chuẩn trên thiết bị thật; không phải dBA/SPL hoặc chứng nhận điều kiện phòng thi. Chưa benchmark Spleeter so với FFmpeg trên tiếng Việt; thay đổi này giữ FFmpeg trước STT. Chưa kiểm tra GUI Windows/macOS hay microphone phần cứng. Xem [thiết kế và hướng dẫn](architecture/crud-noise-check.md).

## Upload credentials Google qua admin — 11/09/2026

- 20 test API/audio/migration/seed đạt trên SQLite và PostgreSQL/pgvector; database PostgreSQL kiểm thử tách riêng dữ liệu ứng dụng.
- Kiểm tra chỉ ADMIN được upload, JSON tối đa 64 KB, cấu trúc service account/private key/token URI, không trả khóa bí mật qua API hoặc audit. JSON lỗi và lỗi ghi file giữ nguyên credentials cũ.
- Kiểm tra file quyền `600`, thư mục `700`, ưu tiên file upload so với cấu hình môi trường; các trạng thái thiếu, không đọc được và không hợp lệ; một tiến trình Python mới đọc được credentials đã lưu.
- Upload file service account thật thành công qua trình duyệt; worker đọc được ngay từ volume dùng chung. Sau khi bỏ mount file host và tạo lại container API/worker, credentials vẫn sẵn sàng.
- Google Cloud STT thật nhận dạng thành công mẫu tiếng Anh JFK 11 giây với credentials upload sau khi tạo lại container. Trạng thái cấu hình vẫn là `local_server`; upload không tự đổi provider.
- Docker build và Compose health đạt; Ruff, TypeScript, ESLint và `git diff --check` đạt.
- Playwright trên Compose: 2/2 test đạt, bao gồm upload JSON lỗi qua giao diện và xác nhận credentials đang dùng được giữ nguyên. Ảnh trang [cấu hình STT](screenshots/speech-settings.png) đã che metadata tài khoản thật.

Trạng thái credentials trên giao diện kiểm tra khả năng đọc và tính hợp lệ của file/key; không thay thế kiểm tra quyền, API, billing hoặc quota trên Google Cloud. Chưa đánh giá chất lượng tiếng Việt trong lớp học từ thử nghiệm mẫu tiếng Anh.

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

Tại thời điểm kiểm tra bản mở rộng này, chưa xác nhận bằng credentials thật: Google Cloud STT, Gemini chấm và chất lượng tiếng Việt trong lớp có tạp âm. Google Cloud STT đã được kiểm tra bổ sung trong mục upload credentials phía trên. Bộ lọc giảm nhiễu không phải source separation; không bảo đảm tách được người khác nói chồng. Chưa kiểm tra Electron GUI Windows/macOS, microphone/camera phần cứng và tải đồng thời cả lớp. Playwright Electron sử dụng cấu hình khởi chạy kiểm thử của Playwright; không thay thế kiểm thử sandbox/installer production.

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
