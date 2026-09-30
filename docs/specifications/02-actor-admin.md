# Actor: Khảo thí (Examiner)

## 1. Actor Profile

| Thuộc tính                   | Mô tả                                                                                                                                                                 |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Vai trò**             | `EXAMINER`                                                                                                                                                               |
| **Mô tả**              | Người quản lý kỳ thi: tạo môn học, giao đề cho giảng viên, thêm danh sách sinh viên đủ điều kiện, setup lịch thi và ca thi, chốt điểm học kỳ |
| **Phạm vi quyền hạn** | Toàn bộ hệ thống                                                                                                                                                    |

---

## 2. User Stories

### US-EXAMINER-001: Quản lý môn học

> **As a** Khảo thí
> **I want to** tạo, chỉnh sửa, lưu trữ và xóa môn học
> **So that** tôi có thể quản lý các môn thi trong hệ thống

### US-EXAMINER-002: Giao đề cho giảng viên

> **As a** Khảo thí
> **I want to** giao đề thi cho giảng viên bộ môn
> **So that** giảng viên có thể ra đề và duyệt đề cho kỳ thi

### US-EXAMINER-003: Quản lý danh sách sinh viên

> **As a** Khảo thí
> **I want to** thêm/bớt sinh viên vào danh sách thi
> **So that** chỉ sinh viên đủ điều kiện mới được thi

### US-EXAMINER-004: Setup lịch thi

> **As a** Khảo thí
> **I want to** thiết lập lịch thi và ca thi
> **So that** sinh viên biết thời gian và ca thi của mình

### US-EXAMINER-005: Xem và duyệt kết quả

> **As a** Khảo thí
> **I want to** xem kết quả thi và duyệt điểm cuối kỳ
> **So that** đảm bảo điểm thi chính xác và công bằng

---

## 3. Use Cases

### UC-EXAMINER-001: Tạo môn học

| Thuộc tính             | Mô tả                                              |
| ------------------------ | ---------------------------------------------------- |
| **UC-ID**          | UC-EXAMINER-001                                         |
| **Tên**           | Tạo môn học                                       |
| **Actor**          | Khảo thí                                           |
| **Mô tả**        | Khảo thí tạo một môn học mới trong hệ thống |
| **Pre-condition**  | Khảo thí đã đăng nhập                         |
| **Post-condition** | Môn học được tạo với trạng thái ACTIVE      |

#### Main Flow

1. Khảo thí chọn "Tạo môn học"
2. Khảo thí nhập mã môn, tên, mô tả
3. Khảo thí bấm "Lưu"
4. Hệ thống tạo môn học và hiển thị thông báo thành công

#### Alternative Flows

- **AF-001.1:** Mã môn đã tồn tại → Hệ thống báo lỗi "Mã môn đã tồn tại"

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

- **AF-002.1:** Giảng viên không thuộc bộ môn → Hệ thống báo lỗi

---

### UC-EXAMINER-004: Thêm sinh viên vào danh sách thi

| Thuộc tính             | Mô tả                                                           |
| ------------------------ | ----------------------------------------------------------------- |
| **UC-ID**          | UC-EXAMINER-004                                                      |
| **Tên**           | Thêm sinh viên vào danh sách thi                              |
| **Actor**          | Khảo thí                                                        |
| **Mô tả**        | Khảo thí thêm sinh viên vào môn học để được phép thi |
| **Pre-condition**  | Sinh viên có tài khoản trong hệ thống                       |
| **Post-condition** | Sinh viên được thêm vào enrollment của môn học           |

#### Main Flow

1. Khảo thí chọn môn học → "Học viên"
2. Khảo thí chọn tài khoản sinh viên
3. Khảo thí bấm "Thêm vào môn học"
4. Hệ thống tạo enrollment

#### Alternative Flows

- **AF-004.1:** Sinh viên đã có trong danh sách → Hệ thống báo lỗi
- **AF-004.2:** Sinh viên chưa có tài khoản → Hệ thống yêu cầu tạo tài khoản trước

---

### UC-EXAMINER-005: Setup lịch thi

| Thuộc tính             | Mô tả                                                   |
| ------------------------ | --------------------------------------------------------- |
| **UC-ID**          | UC-EXAMINER-005                                              |
| **Tên**           | Setup lịch thi                                           |
| **Actor**          | Khảo thí                                                |
| **Mô tả**        | Khảo thí thiết lập lịch thi và ca thi cho môn học |
| **Pre-condition**  | Môn học đã có đề thi được duyệt                |
| **Post-condition** | Lịch thi được thiết lập                             |

#### Main Flow

1. Khảo thí chọn môn học → "Lịch thi"
2. Khảo thí chọn đề thi, ngày thi, ca thi, thời gian
3. Khảo thí bấm "Lưu lịch"
4. Hệ thống lưu lịch thi

#### Alternative Flows

- **AF-005.1:** Đề chưa được duyệt → Hệ thống báo lỗi "Cần duyệt đề trước"

---

### UC-EXAMINER-006: Xem kết quả thi

| Thuộc tính             | Mô tả                                                 |
| ------------------------ | ------------------------------------------------------- |
| **UC-ID**          | UC-EXAMINER-006                                            |
| **Tên**           | Xem kết quả thi                                       |
| **Actor**          | Khảo thí                                              |
| **Mô tả**        | Khảo thí xem danh sách kết quả thi của sinh viên |
| **Pre-condition**  | Sinh viên đã nộp bài                               |
| **Post-condition** | Khảo thí xem được kết quả chi tiết              |

#### Main Flow

1. Khảo thí chọn môn học → "Kết quả & xem lại"
2. Khảo thí xem danh sách sinh viên và điểm
3. Khảo thí chọn sinh viên để xem chi tiết
4. Hệ thống hiển thị: transcript, audio, video, điểm, rubric

#### Alternative Flows

- **AF-006.1:** Bài chưa chấm xong → Hiển thị trạng thái "Đang chấm"

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
2. Khảo thí kiểm tra các bài có confidence thấp
3. Khảo thí duyệt từng bài hoặc duyệt hàng loạt
4. Khảo thí bấm "Chốt điểm"
5. Hệ thống xác nhận và công bố điểm

---

## 4. Bảng tổng hợp Use Cases

| UC-ID        | Tên Use Case                        | Pre-condition              | Post-condition                 |
| ------------ | ------------------------------------ | -------------------------- | ------------------------------ |
| UC-EXAMINER-001 | Tạo môn học                       | Đã đăng nhập          | Môn học được tạo         |
| UC-EXAMINER-002 | Giao đề cho giảng viên           | Môn có giảng viên      | Giảng viên nhận thông báo |
| UC-EXAMINER-003 | Thêm sinh viên vào danh sách thi | Sinh viên có tài khoản | Enrollment được tạo        |
| UC-EXAMINER-004 | Setup lịch thi                      | Đề đã duyệt           | Lịch thi được lưu         |
| UC-EXAMINER-005 | Xem kết quả thi                    | Sinh viên đã nộp bài  | Kết quả được hiển thị   |
| UC-EXAMINER-006 | Duyệt và chốt điểm              | Có kết quả chấm        | Điểm được công bố       |

> **Ghi chú:** Các chức năng cấu hình hệ thống (AI, STT, OAuth) và quản lý tài khoản người dùng thuộc về **System Admin**.
