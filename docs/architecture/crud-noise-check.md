# CRUD và kiểm tra tiếng ồn trước thi — 13/09/2026

## Quản lý môn học, rubric, đề thi

| Đối tượng | Tạo/đọc/sửa | Xóa và dữ liệu đang dùng |
| --- | --- | --- |
| Môn học | Danh sách, workspace, form Cài đặt; ADMIN hoặc giảng viên phụ trách được sửa | `DELETE /admin/courses/{id}` xóa thật khi không có LO, chủ đề, tài liệu, rubric hoặc đề thi; còn dữ liệu trả 409 `COURSE_IN_USE` |
| Rubric | Danh sách tiêu chí, tên, mô tả, điểm/trọng số; sửa tăng version | `DELETE /admin/rubrics/{id}` trả 409 `RUBRIC_IN_USE` khi còn đề thi tham chiếu; sửa rubric không đổi snapshot đề đã công bố |
| Đề thi | Danh sách hiển thị rubric/blueprint, tạo và sửa bản nháp; không chuyển môn khi sửa | Chỉ xóa bản nháp; đề đã công bố không sửa/xóa để bảo toàn lịch sử |

`POST /admin/courses/{id}/archive` và `/restore` chuyển trạng thái môn; lưu trữ chặn tạo đề và sao chép đề. **Thay đổi hành vi API:** trước đây DELETE môn học chỉ lưu trữ; client tích hợp muốn giữ hành vi đó phải chuyển sang POST `/archive`.

`POST /admin/exams/{id}/copy` tạo bản nháp mới có tên thêm “(bản sao)”, giữ rubric ID, thời gian và blueprint, không có snapshot, assignment, session hoặc kết quả. Bản sao dùng rubric và nguồn kiến thức hiện tại khi công bố lại, không phải bản chụp kiến thức của đề gốc. Giảng viên khác môn và STUDENT/REVIEWER không được thực hiện thao tác ghi. Giao diện có hủy sửa, reset form sau lưu, xóa có xác nhận; lỗi dependency hiện tại vị trí thao tác.

Không thay đổi bảng/cột hay chạy migration mới. Foreign key vẫn là lớp bảo vệ cuối khi có thao tác đồng thời.

## Kiểm tra tiếng ồn

Module tái sử dụng: `apps/admin-web/lib/noise-check.ts`; UI: `components/noise-check.tsx`. Electron tải cùng renderer với web nên không cần IPC, quyền hệ thống mới hoặc mô hình tải về. Dùng [Web Audio AnalyserNode](https://developer.mozilla.org/en-US/docs/Web/API/AnalyserNode/getFloatTimeDomainData) để đọc PCM và tính RMS.

1. Sau cấp quyền camera/mic, nút bắt đầu thi chờ kết quả đạt hoặc thao tác bỏ qua.
2. Người dùng bấm kiểm tra và giữ im lặng, tắt loa. Mở luồng audio riêng trên cùng device ID, yêu cầu tắt echo cancellation, noise suppression và auto gain. Nếu browser báo các xử lý đó vẫn bật, hiện lỗi thay vì báo đạt. Một số driver vẫn xử lý phần cứng; không coi đây là phép đo đã hiệu chuẩn.
3. Bỏ 500 ms đầu; lấy 50 cửa sổ PCM dài 2048 sample, cách nhau 100 ms. Đo khoảng 5 giây, có tiến độ. Không dùng MediaRecorder hay gửi HTTP cho phép đo.
4. Tính `20 log10(RMS)` theo dBFS; quá ồn nếu ít nhất 20% cửa sổ có mức ≥ −40 dBFS. Bỏ qua đột biến đơn lẻ. Nếu mọi cửa sổ dưới −90 dBFS, yêu cầu kiểm tra mic thay vì kết luận yên lặng. Đây là heuristic, không phân loại người nói, nhạc, quạt hoặc nguồn âm cụ thể.
5. Phòng ồn → yêu cầu tìm nơi yên lặng và kiểm tra lại; lỗi hoặc không tín hiệu → có thể thử lại. Bỏ qua được cả trước/trong/sau đo; hủy phép đo, kết quả cũ không được ghi đè trạng thái bỏ qua.
6. Dừng luồng kiểm tra và đóng AudioContext khi hoàn tất/lỗi/hủy/unmount; giữ luồng camera/mic chính cho thi. Kết nối lại thiết bị làm mất kết quả cũ và cần kiểm tra lại hoặc bỏ qua. Luồng getUserMedia đang chờ cấp quyền chỉ giải phóng được khi trình duyệt trả về; kết quả đó bị hủy và track được dừng ngay.

Bước này chỉ hỗ trợ trước thi, không tính vào thời gian bài, không giám sát liên tục, không lưu quyết định bỏ qua hay audio lên server. API bắt đầu thi không dùng kết quả này để chống gian lận. Mức dBFS phụ thuộc mic/gain/vị trí, không đổi được trực tiếp thành dBA/dB SPL. Cần thử nghiệm thiết bị thật và tiếng Việt trong lớp trước khi đặt ngưỡng triển khai rộng.

## Spleeter và STT

[Spleeter](https://github.com/deezer/spleeter) là mô hình tách nguồn âm nhạc của Deezer, có 2/4/5 stems như giọng hát, nhạc đệm, trống, bass. Suy luận cho dự án: mô hình này không mặc nhiên tốt hơn denoiser cho tiếng nói vấn đáp; khả năng cải thiện khi có nhạc nền cần đo, tiếng nói chồng và tiếng môi trường không được bảo đảm. Không có benchmark trực tiếp trong thay đổi này.

Giữ pipeline FFmpeg hiện tại: resample 16 kHz, highpass 80 Hz, lowpass 7600 Hz, `afftdn`, loudness normalization → Whisper/Google STT. Audio/video minh chứng luôn giữ bản gốc. TTS là tạo tiếng nói từ văn bản; xử lý ở đây là STT.

Nếu thử Spleeter sau này, so sánh ba nhánh không lọc/FFmpeg/Spleeter trên cùng audio và cùng cấu hình STT. Tập kiểm thử cần tiếng Việt có transcript chuẩn, nhiều microphone và mức nhiễu (quạt, xe, nhạc, người khác nói), cả mẫu sạch. Đo WER/CER, độ trễ, peak RAM và lỗi/mất từ. Chỉ đổi mặc định khi có cải thiện định lượng, không chỉ nghe có vẻ sạch hơn.

## Triển khai và kiểm thử

Dockerfile/Compose hiện có sao chép đủ module web và API; không thêm dependency hoặc service Spleeter. Rebuild/recreate API, worker, web; giữ PostgreSQL, MinIO, Redis và app_data. Jenkins chưa có trong repository; CI chính là GitHub Actions, đã thêm unit test âm thanh bên cạnh lint/build/API/E2E.

Xem [biên bản kiểm thử](../validation.md) cho kết quả đã chạy và giới hạn phần cứng.
