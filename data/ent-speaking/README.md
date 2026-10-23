# Speaking Test — 6 môn ENT độc lập

Cấu trúc cập nhật ngày **21/10/2026** trên [domain chính](https://oral-test.paperlens.uk):
**ENT001, ENT104, ENT203, ENT303, ENT403, ENT503** là sáu môn riêng.
Mỗi môn có một đề mẫu gồm hai phần, một rubric riêng, một chủ đề, mục tiêu
học tập và ba tài liệu riêng. Vào **Môn học** hoặc **Ngân hàng đề thi** rồi chọn
môn ENT tương ứng. ID từng môn/đề/rubric nằm trong [import-report.json](import-report.json).

Các rubric có cùng tiêu chí từ workbook nguồn nhưng có bản ghi và ID độc lập,
cho phép chỉnh từng môn riêng. Tài liệu và snapshot không tham chiếu môn cũ.

| Môn | Chủ đề mẫu | Hình thức trong nguồn | Part 1: chuẩn bị / nói | Part 2: chuẩn bị / nói |
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

Mỗi môn có rubric tên `<mã môn> — Speaking Rubric / 10 points`, giữ mô tả của sheet
`Rubric`, ô A5:E11, trong **Speaking Rubric.xlsx**. Năm tiêu chí:
Ideas; Pronunciation; Grammar Range and Accuracy; Vocabulary Range and Accuracy;
Fluency and coherence. Mỗi tiêu chí tối đa 2 điểm, trọng số bằng nhau.

Bốn khoảng điểm giữ theo nguồn: `[0, 0.6)`, `[0.6, 1)`, `[1, 1.6)`, `[1.6, 2]`.
Sheet `ENT Speaking` là mẫu ghi điểm, không có danh sách sinh viên cần nhập.
API tài liệu không nhận XLSX nên nội dung rubric được đưa vào rubric có cấu trúc
và `Speaking-Rubric-source.txt`; không đổi đuôi workbook để giả thành PDF/TXT.

Mỗi môn có PDF hướng dẫn tương ứng làm giáo trình, giữ nguyên hình/nội dung và
kiểm tra SHA-256 với bản gốc. Mỗi môn có thêm một TXT rubric và một TXT trích xuất,
ghi nguồn, lưu ngắt trang, giải thích cách triển khai. Thẻ thông tin A/B trong
ảnh ENT203 trang 2 được chép lại sau khi kiểm tra trực quan; giảng viên vẫn phải
phát riêng thẻ tương ứng cho từng vai. Các ngày tháng/email trong thẻ là nội dung
tình huống, không phải lịch thi hay yêu cầu liên hệ.

`assessment.json` phiên bản 2 lưu sáu định nghĩa môn, câu hỏi, thời lượng,
nguồn tiêu chí rubric và SHA-256. Importer tạo rubric riêng theo mã từng môn.
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

Importer tìm môn theo mã ENT chính xác, tạo khi chưa có, kiểm tra tên/trạng thái,
SHA-256 của nguồn, trùng tên và nội dung;
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
18 tài liệu (6 PDF giáo trình, 6 TXT theo môn, 6 bản TXT rubric độc lập). File nguồn PDF/XLSX không
được sao chép vào Git; cần giữ bản gốc để chạy lại kiểm tra checksum.


Có thể dùng `--course-code ENT203` để chỉ nhập/kiểm tra một môn. Báo cáo từng
môn được lưu tại `reports/<mã môn>.json`; báo cáo tổng được cập nhật khi chạy
đủ sáu môn. Importer thông thường không xóa dữ liệu cũ.

## Chuyển đổi và xóa môn/lớp cũ

Theo yêu cầu ngày 21/10/2026, đã thay cấu trúc môn gộp SE102 bằng sáu môn ENT,
xóa các môn tiếng Anh cũ `IELTS4.0`, `SE102`, `ENGLISH-ORAL-03` cùng lớp và dữ
liệu thi thuộc chúng. Đã xóa hai lớp `IELTS4.0-01` (Band 4.0) và `SE1` (Test01). Đọc lại backend
xác nhận còn sáu môn ENT và không còn lớp cũ. Tài khoản người dùng và bộ môn
không thuộc thao tác xóa.
Báo cáo cấu trúc cũ được giữ tại `history/2026-10-20-single-course.json` chỉ để
đối chiếu lịch sử; các ID trong đó không còn là dữ liệu đang sử dụng.

Script `remove_legacy_courses.py` giới hạn bằng đúng ba ID/mã cũ, kiểm tra trực
tiếp sáu môn thay thế, rubric, đề và nguồn độc lập trước khi xóa. API xóa toàn
bộ cây dữ liệu môn học cũng xóa lớp, ghi danh, đề, lượt thi, kết quả; worker dọn
tệp vật lý sau giao dịch. Báo cáo [migration-report.json](migration-report.json) ghi đối tượng đã xóa
và kết quả đọc lại danh sách môn/lớp. Script không chọn đối tượng bằng tìm tên
chứa “English” hay “Speaking”.

```bash
# Chỉ kiểm tra các môn thay thế và hiển thị đúng ba đối tượng cũ.
.venv/bin/python data/ent-speaking/remove_legacy_courses.py

# Thực hiện yêu cầu xóa đã chốt, sau khi tất cả môn mới đã được kiểm tra.
.venv/bin/python data/ent-speaking/remove_legacy_courses.py --apply
```
