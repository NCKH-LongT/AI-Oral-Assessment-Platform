# Actor: Khảo thí (Examiner)

## 1. Actor Profile

| Thuộc tính                   | Mô tả                                                                                                                                                                 |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Vai trò**             | `EXAMINER`                                                                                                                                                               |
| **Mô tả**              | Người quản lý kỳ thi: quản lý môn học, giao yêu cầu ra đề cho giảng viên, thêm danh sách sinh viên đủ điều kiện, setup lịch thi/ca thi, điều phối chấm chéo, duyệt điểm và xuất bảng điểm FAP |
| **Phạm vi quyền hạn** | Quản lý kỳ thi, lịch thi và kết quả điểm số trên toàn hệ thống                                                                                                          |

---

## 2. User Stories

### US-EXAMINER-001: Quản lý môn học
> **As a** Khảo thí  
> **I want to** tạo, chỉnh sửa, lưu trữ và xóa môn học bằng mã xác nhận  
> **So that** tôi có thể quản lý danh mục môn thi trong hệ thống

### US-EXAMINER-002: Giao đề cho giảng viên
> **As a** Khảo thí  
> **I want to** giao yêu cầu làm đề thi cho giảng viên bộ môn  
> **So that** giảng viên có thể biên soạn và công bố đề chuẩn cho kỳ thi

### US-EXAMINER-003: Quản lý danh sách sinh viên dự thi
> **As a** Khảo thí  
> **I want to** thêm/bớt sinh viên vào danh sách môn học và ca thi  
> **So that** chỉ sinh viên đủ điều kiện mới được phép tham gia thi

### US-EXAMINER-004: Setup lịch thi và ca thi
> **As a** Khảo thí  
> **I want to** thiết lập lịch thi, phòng thi và ca thi cho môn học  
> **So that** sinh viên biết chính xác thời gian và ca thi của mình

### US-EXAMINER-005: Xem và giám sát kết quả thi
> **As a** Khảo thí  
> **I want to** xem danh sách kết quả, nghe lại audio và đối soát transcript  
> **So that** nắm bắt tình hình làm bài và phát hiện các trường hợp bất thường

### US-EXAMINER-006: Điều phối chấm chéo / phúc khảo
> **As a** Khảo thí  
> **I want to** chỉ định một giảng viên khác trong bộ môn chấm lại bài thi  
> **So that** xử lý công bằng các đơn phúc khảo hoặc các bài thi có độ lệch điểm AI và giảng viên $\ge 1.5$ điểm

### US-EXAMINER-007: Duyệt và chốt điểm
> **As a** Khảo thí  
> **I want to** kiểm tra và duyệt điểm chính thức của lớp/ca thi  
> **So that** hoàn tất quá trình đánh giá kỳ thi

### US-EXAMINER-008: Xuất bảng điểm FAP và khóa sổ điểm
> **As a** Khảo thí  
> **I want to** xuất file bảng điểm định dạng chuẩn FAP (Excel/CSV) và khóa sổ điểm  
> **So that** nộp điểm về Phòng Đào tạo FPT và bảo vệ bảng điểm không bị chỉnh sửa sau kỳ thi

---

## 3. Use Cases

### UC-EXAMINER-001: Quản lý môn học

| Thuộc tính             | Mô tả                                                                    |
| ------------------------ | -------------------------------------------------------------------------- |
| **UC-ID**          | UC-EXAMINER-001                                                            |
| **Tên**           | Quản lý môn học                                                          |
| **Actor**          | Khảo thí                                                                  |
| **Mô tả**        | Khảo thí tạo môn mới, sửa thông tin, lưu trữ hoặc xóa môn học an toàn    |
| **Pre-condition**  | Khảo thí đã đăng nhập                                                |
| **Post-condition** | Môn học được cập nhật trạng thái trong hệ thống                         |

#### Main Flow
1. Khảo thí chọn "Tạo môn học"
2. Khảo thí nhập mã môn, tên, mô tả
3. Khảo thí bấm "Lưu"
4. Hệ thống tạo môn học và hiển thị thông báo thành công

#### Alternative Flows
- **AF-001.1 (Mã môn trùng):** Mã môn đã tồn tại $\rightarrow$ Hệ thống báo lỗi "Mã môn đã tồn tại".
- **AF-001.2 (Lưu trữ môn):** Khảo thí chọn "Lưu trữ" $\rightarrow$ Môn chuyển sang `ARCHIVED`, chặn tạo đề mới.
- **AF-001.3 (Xóa môn học an toàn):** Khảo thí chọn "Xóa môn" $\rightarrow$ Hệ thống yêu cầu nhập đúng mã môn để xác nhận. Khóa dòng dữ liệu `NOWAIT`, dọn rác MinIO và xóa cascade toàn bộ cây môn học.

---

### UC-EXAMINER-002: Giao đề cho giảng viên

| Thuộc tính             | Mô tả                                                     |
| ------------------------ | ----------------------------------------------------------- |
| **UC-ID**          | UC-EXAMINER-002                                                |
| **Tên**           | Giao đề cho giảng viên                                  |
| **Actor**          | Khảo thí                                                  |
| **Mô tả**        | Khảo thí giao yêu cầu ra đề cho giảng viên bộ môn |
| **Pre-condition**  | Môn học đã có giảng viên phụ trách                 |
| **Post-condition** | Giảng viên nhận được thông báo yêu cầu ra đề    |

#### Main Flow
1. Khảo thí chọn môn học
2. Khảo thí chọn "Giao đề cho giảng viên"
3. Khảo thí chọn giảng viên phụ trách
4. Khảo thí bấm "Giao"
5. Hệ thống gửi thông báo cho giảng viên

#### Alternative Flows
- **AF-002.1:** Giảng viên không thuộc bộ môn $\rightarrow$ Hệ thống báo lỗi.

---

### UC-EXAMINER-003: Thêm sinh viên vào danh sách thi

| Thuộc tính             | Mô tả                                                           |
| ------------------------ | ----------------------------------------------------------------- |
| **UC-ID**          | UC-EXAMINER-003                                                      |
| **Tên**           | Thêm sinh viên vào danh sách thi                              |
| **Actor**          | Khảo thí                                                        |
| **Mô tả**        | Khảo thí thêm sinh viên vào môn học để được phép thi |
| **Pre-condition**  | Sinh viên có tài khoản trong hệ thống                       |
| **Post-condition** | Sinh viên được thêm vào enrollment của môn học           |

#### Main Flow
1. Khảo thí chọn môn học $\rightarrow$ "Học viên"
2. Khảo thí chọn tài khoản sinh viên (hoặc import danh sách MSSV)
3. Khảo thí bấm "Thêm vào môn học"
4. Hệ thống tạo enrollment

#### Alternative Flows
- **AF-003.1:** Sinh viên đã có trong danh sách $\rightarrow$ Hệ thống báo lỗi.
- **AF-003.2:** Sinh viên chưa có tài khoản $\rightarrow$ Hệ thống yêu cầu tạo tài khoản trước.

---

### UC-EXAMINER-004: Setup lịch thi

| Thuộc tính             | Mô tả                                                   |
| ------------------------ | --------------------------------------------------------- |
| **UC-ID**          | UC-EXAMINER-004                                              |
| **Tên**           | Setup lịch thi                                           |
| **Actor**          | Khảo thí                                                |
| **Mô tả**        | Khảo thí thiết lập lịch thi và ca thi cho môn học |
| **Pre-condition**  | Môn học đã có đề thi được duyệt (`PUBLISHED`)   |
| **Post-condition** | Lịch thi được thiết lập                             |

#### Main Flow
1. Khảo thí chọn môn học $\rightarrow$ "Lịch thi"
2. Khảo thí chọn đề thi, ngày thi, ca thi, thời gian
3. Khảo thí bấm "Lưu lịch"
4. Hệ thống lưu lịch thi

#### Alternative Flows
- **AF-004.1:** Đề chưa được duyệt $\rightarrow$ Hệ thống báo lỗi "Cần duyệt đề trước".

---

### UC-EXAMINER-005: Xem kết quả thi

| Thuộc tính             | Mô tả                                                 |
| ------------------------ | ------------------------------------------------------- |
| **UC-ID**          | UC-EXAMINER-005                                            |
| **Tên**           | Xem kết quả thi                                       |
| **Actor**          | Khảo thí                                              |
| **Mô tả**        | Khảo thí xem danh sách kết quả thi của sinh viên |
| **Pre-condition**  | Sinh viên đã nộp bài                               |
| **Post-condition** | Khảo thí xem được kết quả chi tiết              |

#### Main Flow
1. Khảo thí chọn môn học $\rightarrow$ "Kết quả & xem lại"
2. Khảo thí xem danh sách sinh viên và điểm
3. Khảo thí chọn sinh viên để xem chi tiết
4. Hệ thống hiển thị: transcript, audio, video minh chứng, điểm từng tiêu chí rubric

#### Alternative Flows
- **AF-005.1:** Bài chưa chấm xong $\rightarrow$ Hiển thị trạng thái "Đang chấm".

---

### UC-EXAMINER-006: Điều phối chấm chéo / phúc khảo

| Thuộc tính             | Mô tả                                                                          |
| ------------------------ | -------------------------------------------------------------------------------- |
| **UC-ID**          | UC-EXAMINER-006                                                                  |
| **Tên**           | Điều phối chấm chéo / phúc khảo                                                 |
| **Actor**          | Khảo thí                                                                        |
| **Mô tả**        | Khảo thí chỉ định một Giảng viên khác chấm lại độc lập khi có khiếu nại        |
| **Pre-condition**  | Bài thi có đơn phúc khảo hoặc điểm AI và Giảng viên lệch $\ge 1.5$ điểm         |
| **Post-condition** | Bài thi được phân công cho Giảng viên 2 để chấm mù (Blind Marking)             |

#### Main Flow
1. Khảo thí mở bài thi cần phúc khảo hoặc bài thi bị gắn cờ lệch điểm cao
2. Khảo thí chọn "Yêu cầu chấm lại độc lập"
3. Khảo thí chọn một Giảng viên khác trong khoa (không dạy lớp của sinh viên này)
4. Hệ thống chuyển bài thi vào danh sách chờ chấm của Giảng viên được chỉ định ở chế độ ẩn điểm cũ (Blind)

---

### UC-EXAMINER-007: Duyệt và chốt điểm

| Thuộc tính             | Mô tả                                                |
| ------------------------ | ------------------------------------------------------ |
| **UC-ID**          | UC-EXAMINER-007                                           |
| **Tên**           | Duyệt và chốt điểm                                |
| **Actor**          | Khảo thí                                             |
| **Mô tả**        | Khảo thí duyệt kết quả và chốt điểm cuối kỳ |
| **Pre-condition**  | Đã có kết quả chấm từ AI hoặc giảng viên     |
| **Post-condition** | Điểm được xác nhận và công bố                |

#### Main Flow
1. Khảo thí xem kết quả thi
2. Khảo thí kiểm tra các bài có cờ cần xem xét (`review_required`)
3. Khảo thí duyệt từng bài hoặc duyệt hàng loạt sau khi giảng viên đã thẩm định xong
4. Khảo thí bấm "Chốt điểm"
5. Hệ thống xác nhận và công bố điểm

---

### UC-EXAMINER-008: Xuất bảng điểm FAP và khóa sổ điểm

| Thuộc tính             | Mô tả                                                                          |
| ------------------------ | -------------------------------------------------------------------------------- |
| **UC-ID**          | UC-EXAMINER-008                                                                  |
| **Tên**           | Xuất bảng điểm FAP và khóa sổ điểm                                              |
| **Actor**          | Khảo thí                                                                        |
| **Mô tả**        | Khảo thí xuất file điểm chuẩn FAP và chuyển ca thi sang trạng thái khóa sổ điểm |
| **Pre-condition**  | 100% sinh viên trong ca thi đã có điểm hợp lệ                                  |
| **Post-condition** | Tải về file bảng điểm `.xlsx` chuẩn FAP, trạng thái ca thi chuyển sang `LOCKED`  |

#### Main Flow
1. Khảo thí chọn ca thi đã chốt điểm hoàn tất
2. Khảo thí bấm "Xuất bảng điểm FAP"
3. Hệ thống kiểm tra điều kiện xuất điểm, tạo file Excel chuẩn format FAP FPT (MSSV, Họ tên, Điểm Speaking, Ghi chú)
4. Hệ thống tự động chuyển trạng thái sổ điểm sang `GRADE_LOCKED` để ngăn chặn mọi hành vi sửa điểm
5. Trình duyệt tải xuống file bảng điểm hoàn tất

---

## 4. Bảng tổng hợp Use Cases

| UC-ID           | Tên Use Case                          | Pre-condition              | Post-condition                                 |
| --------------- | ------------------------------------- | -------------------------- | ---------------------------------------------- |
| UC-EXAMINER-001 | Quản lý môn học                       | Đã đăng nhập               | Môn học được cập nhật (Tạo / Lưu trữ / Xóa)    |
| UC-EXAMINER-002 | Giao đề cho giảng viên                | Môn có giảng viên          | Giảng viên nhận thông báo yêu cầu ra đề        |
| UC-EXAMINER-003 | Thêm sinh viên vào danh sách thi      | Sinh viên có tài khoản     | Enrollment được tạo                            |
| UC-EXAMINER-004 | Setup lịch thi                        | Đề đã duyệt                | Lịch thi được lưu                              |
| UC-EXAMINER-005 | Xem kết quả thi                       | Sinh viên đã nộp bài       | Kết quả chi tiết và minh chứng được hiển thị   |
| UC-EXAMINER-006 | Điều phối chấm chéo / phúc khảo       | Có phúc khảo hoặc lệch điểm| Bài thi được giao cho GV2 chấm mù              |
| UC-EXAMINER-007 | Duyệt và chốt điểm                    | Có kết quả chấm            | Điểm được xác nhận                             |
| UC-EXAMINER-008 | Xuất bảng điểm FAP và khóa sổ điểm    | 100% sinh viên có điểm     | File điểm FAP được tải về, sổ điểm bị khóa     |

> **Ghi chú:** Các chức năng cấu hình hạ tầng kỹ thuật (AI, STT, OAuth credentials) và phân quyền tài khoản người dùng thuộc về **System Admin**.
