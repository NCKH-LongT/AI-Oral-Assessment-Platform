# Speaking Test — 6 nhóm đề ENT

Bộ nhập sử dụng **một môn Speaking Test**, mã hiện có **SE102**, trên
[domain chính](https://oral-test.paperlens.uk). Course ID:
`25c3d679-dc4e-4dec-862a-1acfea978b53`. Mã môn được giữ nguyên để không tạo trùng
với môn và giáo trình ENT001 đã có.

Vào **Ngân hàng đề thi → Speaking Test**, lọc theo category ENT001, ENT104,
ENT203, ENT303, ENT403 hoặc ENT503. Mỗi nhóm có một đề mẫu gồm hai phần,
một chủ đề và một mô tả mục tiêu học tập tổng hợp từ tài liệu.

| Nhóm | Chủ đề mẫu | Hình thức trong nguồn | Part 1: chuẩn bị / nói | Part 2: chuẩn bị / nói |
| --- | --- | --- | --- | --- |
| ENT001 | Activities | Cá nhân | 0 / tối đa 3 phút | 2 / tối đa 2 phút |
| ENT104 | Getting acquainted | Cá nhân | 0 / 2 phút | 2 / tối đa 3 phút |
| ENT203 | Getting Acquainted: hai tình huống du lịch | Theo cặp, 10 phút/cặp | 2 / tối đa 4 phút cho cả hai tình huống | 0 / 2 phút mỗi sinh viên |
| ENT303 | Etiquette | Theo cặp, 10 phút/cặp | 2 / tối đa 4 phút cho hội thoại | 0 / 2 phút mỗi sinh viên |
| ENT403 | Personality | Cá nhân | 1 / tối đa 3 phút | 0 / tối đa 3 phút |
| ENT503 | Achieving a goal | Cá nhân | 1 / tối đa 3 phút | 0 / tối đa 3 phút |

ENT001 có khác biệt ngay trong nguồn: trang tổng quan ghi Part 1 là 2 phút,
Part 2 là 2–3 phút nói; trang mẫu ghi Part 1 là 2–3 phút và Part 2 tối đa
2 phút nói. Bộ nhập theo trang mẫu, tổng thời gian tối đa 7 phút.
ENT104/403/503 cũng đặt giới hạn toàn bài 7 phút. ENT203/303 giữ 10 phút/cặp;
bản nháp có một khối thảo luận 2 phút cho một sinh viên, không mô phỏng hai
thí sinh bằng một phiên cá nhân.

Part 1 của ENT001/104 giữ đủ 5 câu hỏi. Part 2 của ENT203/303/403/503
giữ danh sách 5 câu để **giảng viên chọn 1–2**, không bắt sinh viên trả lời cả 5.
Gộp câu hỏi gợi ý vào hai phần để giữ đúng thời lượng chuẩn bị/trả lời từng phần.
Tài liệu chỉ cung cấp một chủ đề mẫu cho mỗi mã; bộ nhập không tự tạo thêm đề
hay coi danh sách này là ngân hàng đầy đủ để bốc thăm.

## Rubric và nguồn

Rubric `ENT Speaking Rubric — 5 criteria / 10 points` giữ mô tả của sheet
`Rubric`, ô A5:E11, trong **Speaking Rubric.xlsx**. Năm tiêu chí:
Ideas; Pronunciation; Grammar Range and Accuracy; Vocabulary Range and Accuracy;
Fluency and coherence. Mỗi tiêu chí tối đa 2 điểm, trọng số bằng nhau.

Bốn khoảng điểm giữ theo nguồn: `[0, 0.6)`, `[0.6, 1)`, `[1, 1.6)`, `[1.6, 2]`.
Sheet `ENT Speaking` là mẫu ghi điểm, không có danh sách sinh viên cần nhập.
API tài liệu không nhận XLSX nên nội dung rubric được đưa vào rubric có cấu trúc
và `Speaking-Rubric-source.txt`; không đổi đuôi workbook để giả thành PDF/TXT.

Sáu PDF gốc được lưu trên backend, giữ nguyên hình và nội dung; ENT001 dùng lại
giáo trình đã tồn tại sau khi so sánh SHA-256. Mỗi mã có thêm một TXT trích xuất,
ghi nguồn, lưu ngắt trang, giải thích cách triển khai. Thẻ thông tin A/B trong
ảnh ENT203 trang 2 được chép lại sau khi kiểm tra trực quan; giảng viên vẫn phải
phát riêng thẻ tương ứng cho từng vai. Các ngày tháng/email trong thẻ là nội dung
tình huống, không phải lịch thi hay yêu cầu liên hệ.

`assessment.json` lưu câu hỏi, thời lượng, tiêu chí và SHA-256 của nguồn.
`*-source.txt` tách nội dung nguồn khỏi ghi chú triển khai. Mô tả LO,
`expected_concepts` và độ khó `MEDIUM` là dữ liệu tổ chức do người nhập bổ sung,
không phải CLO, đáp án cố định hay quy đổi CEFR chính thức.

## Trạng thái và giới hạn

Bộ nhập dừng ở **GENERATED — bản nháp có nội dung để giảng viên duyệt**.
Không tự duyệt, công bố, xếp lịch, ghi danh hay giao đề cho sinh viên.
Đây là nhập dữ liệu vào backend hiện tại, không phải triển khai tính năng thi
speaking tự động hoàn chỉnh.

- Ảnh ENT001 trang 3 và ENT104 trang 2 có trong PDF gốc. Luồng desktop hiện tại
  chưa hỗ trợ ảnh tùy ý qua API biên tập câu hỏi; giảng viên cần cung cấp ảnh
  khi tổ chức thi.
- ENT203/303 cần hai người, đổi vai và nhận diện từng sinh viên. Phiên desktop
  hiện tại dành cho một sinh viên, chưa ghép cặp hay tách giọng hai người.
- Phần thảo luận cần giảng viên chọn câu thực tế. Bản nháp lưu đủ danh sách để
  duyệt, chưa có cơ chế hỏi đáp thích ứng tự động.
- Rubric gốc đánh giá toàn bộ phần thể hiện của từng sinh viên. Điểm hiện tại
  của app là điểm từng khối câu hỏi rồi lấy trung bình; không coi đó là điểm
  tổng thể chính thức theo workbook. Pronunciation và nhịp/ngập ngừng trong
  Fluency cần nghe audio. Phương án chấm phát âm trong [update.md](../../update.md)
  vẫn là đề xuất, chưa được tích hợp.
- Trước khi tổ chức thi, phải bảo đảm STT dùng tiếng Anh. Import API hiện chưa
  cho đặt `speech_language` riêng trong snapshot; bộ nhập không thay cấu hình
  ngôn ngữ toàn hệ thống vì có thể ảnh hưởng môn khác. Khi kiểm tra domain chính
  ngày 20/10/2026, cấu hình hiện có là `local_server`, ngôn ngữ `en`.

## Chạy và kiểm tra

Chạy từ thư mục gốc repository với `.venv` đã có `httpx`, `python-dotenv`,
`openpyxl`. `--source-root` trỏ tới thư mục `OralProject` chứa workbook và
thư mục PDF đúng cấu trúc `relative_path` trong manifest.

```bash
# Chỉ kiểm tra nguồn và in kế hoạch; không đăng nhập/ghi backend.
.venv/bin/python data/ent-speaking/import_course.py --source-root "/path/to/OralProject"

# Thực hiện nhập vào domain chính cố định trong script.
.venv/bin/python data/ent-speaking/import_course.py --source-root "/path/to/OralProject" --apply

# Đọc lại backend để đối chiếu nội dung, nguồn, rubric và thời lượng.
.venv/bin/python data/ent-speaking/import_course.py --source-root "/path/to/OralProject" --verify
```

Credentials lấy từ `BOOTSTRAP_ADMIN` và `BOOTSTRAP_PASSWORD` trong `.env`,
chỉ dùng trong bộ nhớ, không đưa vào bundle/report. Có thể chỉ định
`--env-file` nhưng không truyền mật khẩu trên dòng lệnh.

Importer kiểm tra đúng course ID/mã/tên, SHA-256 của nguồn, trùng tên và nội dung;
tái sử dụng tài liệu giống hệt. Câu hỏi được nhập qua Excel API có preview,
giữ nguyên nội dung thay vì gọi AI soạn lại. Sau khi tài liệu READY,
API tạo snapshot nguồn và importer đặt thời lượng từng phần, category.

Các bước liên quan nhiều endpoint không có transaction chung. Nếu bị gián đoạn,
chạy lại `--apply` để tiếp tục dữ liệu giống hệt; không tự ghi đè nguồn khác,
đề đã duyệt hoặc đề đã sửa câu hỏi. Không chạy đồng thời nhiều importer.
`--verify` áp dụng cho trạng thái bản nháp của bộ nhập; sẽ báo sai khác nếu
giảng viên đã duyệt hoặc sửa dữ liệu.

Kết quả đối chiếu lưu tại [import-report.json](import-report.json), gồm ID
thực tế trên backend, thời điểm kiểm tra UTC, trạng thái, thời lượng và checksum
13 tài liệu (6 PDF, 6 TXT theo nhóm, 1 TXT rubric). File nguồn PDF/XLSX không
được sao chép vào Git; cần giữ bản gốc để chạy lại kiểm tra checksum.
