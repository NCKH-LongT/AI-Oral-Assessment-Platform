# Actor: Giảng viên (Teacher)

## 1. Actor Profile

| Thuộc tính | Mô tả |
|------------|--------|
| **Vai trò** | `TEACHER` |
| **Mô tả** | Người nhận yêu cầu ra đề từ khảo thí, tạo rubric và đề thi, chấm điểm/rà soát sau khi AI chấm bài |
| **Phạm vi quyền hạn** | Môn học được phân công phụ trách |
| **Quyền đặc biệt** | Câu hỏi tạo sau mỗi lần tạo đề được đưa vào ngân hàng câu hỏi chung |

---

## 2. User Stories

### US-TEACHER-001: Nhận yêu cầu ra đề
> **As a** Giảng viên  
> **I want to** nhận yêu cầu ra đề từ khảo thí  
> **So that** tôi biết cần tạo đề thi cho môn nào

### US-TEACHER-002: Tạo rubric đánh giá
> **As a** Giảng viên  
> **I want to** tạo rubric với các tiêu chí đánh giá  
> **So that** hệ thống có tiêu chuẩn để chấm điểm

### US-TEACHER-003: Tạo đề thi
> **As a** Giảng viên  
> **I want to** tạo đề thi với blueprint (phân bổ câu hỏi theo topic/difficulty)  
> **So that** AI có thể sinh câu hỏi phù hợp

### US-TEACHER-004: Duyệt đề trước khi công bố
> **As a** Giảng viên  
> **I want to** xem và duyệt đề do AI sinh  
> **So that** đảm bảo đề đúng yêu cầu trước khi giao cho sinh viên

### US-TEACHER-005: Quản lý ngân hàng câu hỏi
> **As a** Giảng viên  
> **I want to** xem câu hỏi đã tạo từ các lần ra đề trước  
> **So that** có thể tái sử dụng hoặc tham khảo

### US-TEACHER-006: Chấm điểm/rà soát bài thi
> **As a** Giảng viên  
> **I want to** xem và chấm lại bài thi sau khi AI chấm  
> **So that** đảm bảo điểm chính xác

### US-TEACHER-007: Chấm lại với transcript đã sửa
> **As a** Giảng viên  
> **I want to** chấm lại bài thi với transcript đã được sửa  
> **So that** có thể cập nhật điểm nếu transcript ban đầu không chính xác

### US-TEACHER-008: Kiểm tra gợi ý thuật ngữ tiếng Anh
> **As a** Giảng viên  
> **I want to** xem gợi ý thuật ngữ tiếng Anh cho từng câu hỏi  
> **So that** tôi có thể kiểm tra và xác nhận

---

## 3. Use Cases

### UC-TEACHER-001: Nhận yêu cầu ra đề

| Thuộc tính | Mô tả |
|------------|--------|
| **UC-ID** | UC-TEACHER-001 |
| **Tên** | Nhận yêu cầu ra đề |
| **Actor** | Giảng viên |
| **Mô tả** | Giảng viên nhận thông báo yêu cầu ra đề từ khảo thí |
| **Pre-condition** | Khảo thí đã giao đề cho giảng viên |
| **Post-condition** | Giảng viên nhận thông báo và có thể bắt đầu ra đề |

#### Main Flow
1. Giảng viên đăng nhập vào hệ thống
2. Giảng viên nhận thông báo có yêu cầu ra đề mới
3. Giảng viên mở môn học được giao
4. Giảng viên bắt đầu quy trình ra đề

---

### UC-TEACHER-002: Tạo rubric đánh giá

| Thuộc tính | Mô tả |
|------------|--------|
| **UC-ID** | UC-TEACHER-002 |
| **Tên** | Tạo rubric đánh giá |
| **Actor** | Giảng viên |
| **Mô tả** | Giảng viên tạo rubric với các tiêu chí đánh giá |
| **Pre-condition** | Giảng viên đã chọn môn học |
| **Post-condition** | Rubric được lưu và có thể sử dụng cho đề thi |

#### Main Flow
1. Giảng viên chọn môn học → "Rubric"
2. Giảng viên bấm "Tạo rubric"
3. Giảng viên nhập tên rubric
4. Giảng viên thêm tiêu chí (tên, mô tả, điểm tối đa, trọng số)
5. Giảng viên bấm "Lưu rubric"
6. Hệ thống lưu rubric

#### Alternative Flows
- **AF-002.1:** Trọng số các tiêu chí không bằng 100% → Hệ thống cảnh báo nhưng cho phép lưu
- **AF-002.2:** Trùng tên rubric → Hệ thống cho phép (rubric có version riêng)

---

### UC-TEACHER-003: Tạo exam blueprint và đề thi

| Thuộc tính | Mô tả |
|------------|--------|
| **UC-ID** | UC-TEACHER-003 |
| **Tên** | Tạo exam blueprint và đề thi |
| **Actor** | Giảng viên |
| **Mô tả** | Giảng viên tạo bản nháp đề với blueprint và bấm sinh câu hỏi |
| **Pre-condition** | Môn đã có Topics, LO, và giáo trình đã xử lý |
| **Post-condition** | Đề thi được sinh và lưu dưới dạng bản nháp |

#### Main Flow
1. Giảng viên chọn môn → "Bài thi & giao bài"
2. Giảng viên bấm "Tạo bài thi"
3. Giảng viên nhập tên, thời gian làm bài
4. Giảng viên chọn rubric
5. Giảng viên phân bổ câu hỏi theo topic và difficulty (easy/medium/hard)
6. Giảng viên bấm "Sinh câu hỏi & công bố"
7. AI sinh câu hỏi dựa trên blueprint + RAG knowledge
8. Hệ thống hiển thị đề và gợi ý thuật ngữ tiếng Anh

#### Alternative Flows
- **AF-003.1:** Giáo trình chưa xử lý xong → Hệ thống báo lỗi "Cần chờ giáo trình sẵn sàng"
- **AF-003.2:** AI sinh đề thất bại → Hệ thống báo lỗi và cho phép thử lại

---

### UC-TEACHER-004: Duyệt đề trước khi công bố

| Thuộc tính | Mô tả |
|------------|--------|
| **UC-ID** | UC-TEACHER-004 |
| **Tên** | Duyệt đề trước khi công bố |
| **Actor** | Giảng viên |
| **Mô tả** | Giảng viên xem và duyệt đề do AI sinh trước khi giao cho sinh viên |
| **Pre-condition** | Đề đã được AI sinh |
| **Post-condition** | Đề được duyệt và sẵn sàng giao cho sinh viên |

#### Main Flow
1. Sau khi AI sinh đề, hệ thống hiển thị đề
2. Giảng viên xem từng câu hỏi
3. Giảng viên xem gợi ý thuật ngữ tiếng Anh
4. Giảng viên có thể chỉnh sửa câu hỏi nếu cần
5. Giảng viên bấm "Duyệt & Công bố"
6. Hệ thống công bố đề

#### Alternative Flows
- **AF-004.1:** Câu hỏi không phù hợp → Giảng viên chỉnh sửa hoặc bấm "Tạo lại câu này"
- **AF-004.2:** Thoát mà chưa duyệt → Đề vẫn ở trạng thái bản nháp

---

### UC-TEACHER-005: Quản lý ngân hàng câu hỏi

| Thuộc tính | Mô tả |
|------------|--------|
| **UC-ID** | UC-TEACHER-005 |
| **Tên** | Quản lý ngân hàng câu hỏi |
| **Actor** | Giảng viên |
| **Mô tả** | Giảng viên xem và quản lý câu hỏi đã tạo từ các lần ra đề |
| **Pre-condition** | Đã có câu hỏi được tạo từ các đề trước |
| **Post-condition** | Câu hỏi được hiển thị và có thể tái sử dụng |

#### Main Flow
1. Giảng viên chọn môn → "Ngân hàng câu hỏi"
2. Hệ thống hiển thị danh sách câu hỏi đã tạo
3. Giảng viên có thể lọc theo topic, difficulty, ngày tạo
4. Giảng viên có thể xem chi tiết từng câu hỏi
5. Giảng viên có thể đánh dấu câu hỏi yêu thích để dùng lại

---

### UC-TEACHER-006: Xem và chấm lại bài thi

| Thuộc tính | Mô tả |
|------------|--------|
| **UC-ID** | UC-TEACHER-006 |
| **Tên** | Xem và chấm lại bài thi |
| **Actor** | Giảng viên |
| **Mô tả** | Giảng viên xem bài thi sau khi AI chấm và có thể chấm lại |
| **Pre-condition** | Sinh viên đã nộp bài |
| **Post-condition** | Điểm được cập nhật nếu có thay đổi |

#### Main Flow
1. Giảng viên chọn môn → "Kết quả & xem lại"
2. Giảng viên chọn sinh viên cần xem
3. Hệ thống hiển thị: transcript, audio, video, rubric, điểm AI
4. Giảng viên nghe/xem lại bài thi
5. Giảng viên kiểm tra transcript và điểm
6. Giảng viên có thể:
   - Bấm "Duyệt" nếu đồng ý với điểm AI
   - Bấm "Chấm lại" nếu muốn chấm với transcript đã sửa
   - Bấm "Override" để điều chỉnh điểm thủ công (có log)

#### Alternative Flows
- **AF-006.1:** Transcript không chính xác → Giảng viên sửa transcript → "Chấm lại"
- **AF-006.2:** Bài có confidence cao → Giảng viên vẫn có thể duyệt hoặc chấm lại

---

### UC-TEACHER-007: Chấm lại với transcript đã sửa

| Thuộc tính | Mô tả |
|------------|--------|
| **UC-ID** | UC-TEACHER-007 |
| **Tên** | Chấm lại với transcript đã sửa |
| **Actor** | Giảng viên |
| **Mô tả** | Giảng viên sửa transcript và yêu cầu AI chấm lại |
| **Pre-condition** | Giảng viên đang xem bài thi |
| **Post-condition** | AI chấm lại với transcript mới, kết quả được cập nhật |

#### Main Flow
1. Giảng viên đang xem bài thi
2. Giảng viên sửa transcript của câu trả lời
3. Giảng viên bấm "Chấm lại"
4. Giảng viên nhập lý do chấm lại
5. Hệ thống gửi transcript mới + rubric + RAG cho AI
6. AI chấm lại và trả kết quả
7. Hệ thống lưu lịch sử chấm lại

#### Alternative Flows
- **AF-007.1:** AI chấm lại thất bại → Hệ thống giữ kết quả cũ, báo lỗi

---

### UC-TEACHER-008: Kiểm tra gợi ý thuật ngữ tiếng Anh

| Thuộc tính | Mô tả |
|------------|--------|
| **UC-ID** | UC-TEACHER-008 |
| **Tên** | Kiểm tra gợi ý thuật ngữ tiếng Anh |
| **Actor** | Giảng viên |
| **Mô tả** | Giảng viên xem và kiểm tra gợi ý thuật ngữ cho từng câu hỏi |
| **Pre-condition** | Đề đã được sinh |
| **Post-condition** | Giảng viên xác nhận thuật ngữ |

#### Main Flow
1. Sau khi sinh đề, hệ thống hiển thị gợi ý thuật ngữ
2. Giảng viên xem từng câu hỏi và thuật ngữ kèm nghĩa
3. Giảng viên kiểm tra độ chính xác
4. Giảng viên xác nhận hoặc ghi chú thuật ngữ cần điều chỉnh

#### Ghi chú
- Gợi ý được lưu cùng phiên bản đề
- Gợi ý chưa tự truyền vào PhoWhisper
- Giảng viên có thể dùng thuật ngữ này để tạo hotwords cho STT thủ công

---

## 4. Bảng tổng hợp Use Cases

| UC-ID | Tên Use Case | Pre-condition | Post-condition |
|-------|--------------|--------------|----------------|
| UC-TEACHER-001 | Nhận yêu cầu ra đề | Khảo thí giao đề | Giảng viên nhận thông báo |
| UC-TEACHER-002 | Tạo rubric đánh giá | Đã chọn môn học | Rubric được lưu |
| UC-TEACHER-003 | Tạo exam blueprint | Môn có Topics, LO | Đề được sinh dạng bản nháp |
| UC-TEACHER-004 | Duyệt đề | Đề đã sinh | Đề được công bố |
| UC-TEACHER-005 | Quản lý ngân hàng câu hỏi | Có câu hỏi từ trước | Câu hỏi được hiển thị |
| UC-TEACHER-006 | Xem và chấm lại bài thi | Sinh viên nộp bài | Kết quả được duyệt/chấm lại |
| UC-TEACHER-007 | Chấm lại với transcript | Đang xem bài thi | AI chấm lại |
| UC-TEACHER-008 | Kiểm tra thuật ngữ | Đề đã sinh | Thuật ngữ được xác nhận |

---

## 5. Ghi chú đặc biệt

### 5.1 Ngân hàng câu hỏi chung
- Câu hỏi tạo từ mỗi lần ra đề được tự động đưa vào ngân hàng câu hỏi chung
- Câu hỏi trong ngân hàng có thể được tham khảo khi tạo đề mới
- Giảng viên có thể đánh dấu câu hỏi yêu thích để ưu tiên sử dụng lại

### 5.2 Gợi ý thuật ngữ tiếng Anh
- AI gợi ý tối đa 20 thuật ngữ mỗi câu hỏi
- Gợi ý gồm: thuật ngữ tiếng Anh + nghĩa tiếng Việt
- Gợi ý chỉ là tham khảo, giảng viên cần kiểm tra độ chính xác
- Gợi ý được lưu cùng phiên bản đề, không tự cập nhật cho đề cũ
