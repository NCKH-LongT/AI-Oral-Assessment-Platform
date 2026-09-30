# Actor: Khảo thí (Admin)

## 1. Actor Profile

| Thuộc tính | Mô tả |
|------------|--------|
| **Vai trò** | `ADMIN` |
| **Mô tả** | Người quản lý kỳ thi: tạo môn học, giao đề cho giảng viên, thêm danh sách sinh viên đủ điều kiện, setup lịch thi và ca thi, chốt điểm học kỳ |
| **Phạm vi quyền hạn** | Toàn bộ hệ thống |

---

## 2. User Stories

### US-ADMIN-001: Quản lý môn học
> **As a** Khảo thí  
> **I want to** tạo, chỉnh sửa, lưu trữ và xóa môn học  
> **So that** tôi có thể quản lý các môn thi trong hệ thống

### US-ADMIN-002: Upload tài liệu giáo trình
> **As a** Khảo thí  
> **I want to** upload file PDF giáo trình cho môn học  
> **So that** hệ thống có thể extract nội dung và tạo RAG knowledge base

### US-ADMIN-003: Giao đề cho giảng viên
> **As a** Khảo thí  
> **I want to** giao đề thi cho giảng viên bộ môn  
> **So that** giảng viên có thể ra đề và duyệt đề cho kỳ thi

### US-ADMIN-004: Quản lý danh sách sinh viên
> **As a** Khảo thí  
> **I want to** thêm/bớt sinh viên vào danh sách thi  
> **So that** chỉ sinh viên đủ điều kiện mới được thi

### US-ADMIN-005: Setup lịch thi
> **As a** Khảo thí  
> **I want to** thiết lập lịch thi và ca thi  
> **So that** sinh viên biết thời gian và ca thi của mình

### US-ADMIN-006: Xem và duyệt kết quả
> **As a** Khảo thí  
> **I want to** xem kết quả thi và duyệt điểm cuối kỳ  
> **So that** đảm bảo điểm thi chính xác và công bằng

### US-ADMIN-007: Cấu hình hệ thống
> **As a** Khảo thí  
> **I want to** cấu hình AI provider, STT provider, OAuth  
> **So that** hệ thống hoạt động đúng với yêu cầu kỹ thuật

### US-ADMIN-008: Quản lý người dùng
> **As a** Khảo thí  
> **I want to** tạo, chỉnh sửa, phân quyền tài khoản  
> **So that** người dùng có quyền truy cập phù hợp

---

## 3. Use Cases

### UC-ADMIN-001: Tạo môn học

| Thuộc tính | Mô tả |
|------------|--------|
| **UC-ID** | UC-ADMIN-001 |
| **Tên** | Tạo môn học |
| **Actor** | Khảo thí |
| **Mô tả** | Khảo thí tạo một môn học mới trong hệ thống |
| **Pre-condition** | Khảo thí đã đăng nhập |
| **Post-condition** | Môn học được tạo với trạng thái ACTIVE |

#### Main Flow
1. Khảo thí chọn "Tạo môn học"
2. Khảo thí nhập mã môn, tên, mô tả
3. Khảo thí bấm "Lưu"
4. Hệ thống tạo môn học và hiển thị thông báo thành công

#### Alternative Flows
- **AF-001.1:** Mã môn đã tồn tại → Hệ thống báo lỗi "Mã môn đã tồn tại"

---

### UC-ADMIN-002: Upload giáo trình

| Thuộc tính | Mô tả |
|------------|--------|
| **UC-ID** | UC-ADMIN-002 |
| **Tên** | Upload giáo trình |
| **Actor** | Khảo thí |
| **Mô tả** | Khảo thí upload file PDF giáo trình cho môn học |
| **Pre-condition** | Khảo thí đã chọn môn học |
| **Post-condition** | File được upload, xử lý và lưu trữ |

#### Main Flow
1. Khảo thí chọn môn học → "Tài liệu" → "Upload"
2. Khảo thí chọn file PDF
3. Hệ thống upload file lên storage
4. Worker xử lý: extract text → chunk → embedding → pgvector
5. Hệ thống hiển thị trạng thái "Đang xử lý" → "Sẵn sàng"

#### Alternative Flows
- **AF-002.1:** File không phải PDF → Hệ thống báo lỗi "Chỉ chấp nhận file PDF"
- **AF-002.2:** Xử lý thất bại → Trạng thái "Lỗi" + thông báo chi tiết

---

### UC-ADMIN-003: Giao đề cho giảng viên

| Thuộc tính | Mô tả |
|------------|--------|
| **UC-ID** | UC-ADMIN-003 |
| **Tên** | Giao đề cho giảng viên |
| **Actor** | Khảo thí |
| **Mô tả** | Khảo thí giao yêu cầu ra đề cho giảng viên bộ môn |
| **Pre-condition** | Môn học đã có giảng viên phụ trách |
| **Post-condition** | Giảng viên nhận được thông báo yêu cầu ra đề |

#### Main Flow
1. Khảo thí chọn môn học
2. Khảo thí chọn "Giao đề cho giảng viên"
3. Khảo thí chọn giảng viên phụ trách
4. Khảo thí bấm "Giao"
5. Hệ thống gửi thông báo cho giảng viên

#### Alternative Flows
- **AF-003.1:** Giảng viên không thuộc bộ môn → Hệ thống báo lỗi

---

### UC-ADMIN-004: Thêm sinh viên vào danh sách thi

| Thuộc tính | Mô tả |
|------------|--------|
| **UC-ID** | UC-ADMIN-004 |
| **Tên** | Thêm sinh viên vào danh sách thi |
| **Actor** | Khảo thí |
| **Mô tả** | Khảo thí thêm sinh viên vào môn học để được phép thi |
| **Pre-condition** | Sinh viên có tài khoản trong hệ thống |
| **Post-condition** | Sinh viên được thêm vào enrollment của môn học |

#### Main Flow
1. Khảo thí chọn môn học → "Học viên"
2. Khảo thí chọn tài khoản sinh viên
3. Khảo thí bấm "Thêm vào môn học"
4. Hệ thống tạo enrollment

#### Alternative Flows
- **AF-004.1:** Sinh viên đã có trong danh sách → Hệ thống báo lỗi
- **AF-004.2:** Sinh viên chưa có tài khoản → Hệ thống yêu cầu tạo tài khoản trước

---

### UC-ADMIN-005: Setup lịch thi

| Thuộc tính | Mô tả |
|------------|--------|
| **UC-ID** | UC-ADMIN-005 |
| **Tên** | Setup lịch thi |
| **Actor** | Khảo thí |
| **Mô tả** | Khảo thí thiết lập lịch thi và ca thi cho môn học |
| **Pre-condition** | Môn học đã có đề thi được duyệt |
| **Post-condition** | Lịch thi được thiết lập |

#### Main Flow
1. Khảo thí chọn môn học → "Lịch thi"
2. Khảo thí chọn đề thi, ngày thi, ca thi, thời gian
3. Khảo thí bấm "Lưu lịch"
4. Hệ thống lưu lịch thi

#### Alternative Flows
- **AF-005.1:** Đề chưa được duyệt → Hệ thống báo lỗi "Cần duyệt đề trước"

---

### UC-ADMIN-006: Xem kết quả thi

| Thuộc tính | Mô tả |
|------------|--------|
| **UC-ID** | UC-ADMIN-006 |
| **Tên** | Xem kết quả thi |
| **Actor** | Khảo thí |
| **Mô tả** | Khảo thí xem danh sách kết quả thi của sinh viên |
| **Pre-condition** | Sinh viên đã nộp bài |
| **Post-condition** | Khảo thí xem được kết quả chi tiết |

#### Main Flow
1. Khảo thí chọn môn học → "Kết quả & xem lại"
2. Khảo thí xem danh sách sinh viên và điểm
3. Khảo thí chọn sinh viên để xem chi tiết
4. Hệ thống hiển thị: transcript, audio, video, điểm, rubric

#### Alternative Flows
- **AF-006.1:** Bài chưa chấm xong → Hiển thị trạng thái "Đang chấm"

---

### UC-ADMIN-007: Duyệt và chốt điểm

| Thuộc tính | Mô tả |
|------------|--------|
| **UC-ID** | UC-ADMIN-007 |
| **Tên** | Duyệt và chốt điểm |
| **Actor** | Khảo thí |
| **Mô tả** | Khảo thí duyệt kết quả và chốt điểm cuối kỳ |
| **Pre-condition** | Đã có kết quả chấm từ AI hoặc giảng viên |
| **Post-condition** | Điểm được xác nhận và công bố |

#### Main Flow
1. Khảo thí xem kết quả thi
2. Khảo thí kiểm tra các bài có confidence thấp
3. Khảo thí duyệt từng bài hoặc duyệt hàng loạt
4. Khảo thí bấm "Chốt điểm"
5. Hệ thống xác nhận và công bố điểm

---

### UC-ADMIN-008: Cấu hình AI provider

| Thuộc tính | Mô tả |
|------------|--------|
| **UC-ID** | UC-ADMIN-008 |
| **Tên** | Cấu hình AI provider |
| **Actor** | Khảo thí |
| **Mô tả** | Khảo thí chọn AI provider (Gemini/Ollama) và cấu hình |
| **Pre-condition** | Khảo thí có quyền quản trị |
| **Post-condition** | AI provider được cấu hình |

#### Main Flow
1. Khảo thí vào "Cấu hình hệ thống" → "AI & Grading"
2. Khảo thí chọn provider (Gemini/Ollama)
3. Khảo thí nhập API key hoặc URL
4. Khảo thí chọn model
5. Khảo thí bấm "Lưu"
6. Hệ thống cập nhật cấu hình

---

### UC-ADMIN-009: Quản lý tài khoản người dùng

| Thuộc tính | Mô tả |
|------------|--------|
| **UC-ID** | UC-ADMIN-009 |
| **Tên** | Quản lý tài khoản người dùng |
| **Actor** | Khảo thí |
| **Mô tả** | Khảo thí tạo, sửa, xóa và phân quyền tài khoản |
| **Pre-condition** | Khảo thí đã đăng nhập |
| **Post-condition** | Tài khoản được tạo/sửa/xóa với quyền phù hợp |

#### Main Flow
1. Khảo thí vào "Người dùng"
2. Khảo thí chọn tạo/sửa/xóa tài khoản
3. Khảo thí nhập thông tin và chọn vai trò
4. Hệ thống lưu thay đổi

#### Alternative Flows
- **AF-009.1:** Xóa tài khoản đang có dữ liệu → Hệ thống cảnh báo và yêu cầu xác nhận

---

## 4. Bảng tổng hợp Use Cases

| UC-ID | Tên Use Case | Pre-condition | Post-condition |
|-------|--------------|--------------|----------------|
| UC-ADMIN-001 | Tạo môn học | Đã đăng nhập | Môn học được tạo |
| UC-ADMIN-002 | Upload giáo trình | Đã chọn môn | File được xử lý |
| UC-ADMIN-003 | Giao đề cho giảng viên | Môn có giảng viên | Giảng viên nhận thông báo |
| UC-ADMIN-004 | Thêm sinh viên vào danh sách thi | Sinh viên có tài khoản | Enrollment được tạo |
| UC-ADMIN-005 | Setup lịch thi | Đề đã duyệt | Lịch thi được lưu |
| UC-ADMIN-006 | Xem kết quả thi | Sinh viên đã nộp bài | Kết quả được hiển thị |
| UC-ADMIN-007 | Duyệt và chốt điểm | Có kết quả chấm | Điểm được công bố |
| UC-ADMIN-008 | Cấu hình AI provider | Có quyền quản trị | Cấu hình được lưu |
| UC-ADMIN-009 | Quản lý tài khoản | Đã đăng nhập | Tài khoản được cập nhật |
