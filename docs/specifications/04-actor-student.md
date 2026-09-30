# Actor: Sinh viên (Student)

## 1. Actor Profile

| Thuộc tính | Mô tả |
|------------|--------|
| **Vai trò** | `STUDENT` |
| **Mô tả** | Người thi trên máy tính cá nhân, chỉ những sinh viên nằm trong danh sách thi mới được thi |
| **Phạm vi quyền hạn** | Chỉ xem và làm bài thi được giao, xem điểm cá nhân |
| **Thiết bị sử dụng** | Máy tính cá nhân với ứng dụng desktop (Electron) |

---

## 2. User Stories

### US-STUDENT-001: Đăng nhập hệ thống
> **As a** Sinh viên  
> **I want to** đăng nhập vào ứng dụng desktop  
> **So that** tôi có thể truy cập bài thi của mình

### US-STUDENT-002: Xem danh sách bài thi
> **As a** Sinh viên  
> **I want to** xem danh sách bài thi được giao  
> **So that** tôi biết mình cần thi những môn nào

### US-STUDENT-003: Kiểm tra thiết bị trước khi thi
> **As a** Sinh viên  
> **I want to** kiểm tra camera và microphone  
> **So that** đảm bảo thiết bị hoạt động đúng trước khi bắt đầu

### US-STUDENT-004: Làm bài thi vấn đáp
> **As a** Sinh viên  
> **I want to** trả lời câu hỏi bằng giọng nói  
> **So that** tôi hoàn thành bài thi của mình

### US-STUDENT-005: Nghe lại và sửa transcript
> **As a** Sinh viên  
> **I want to** nghe lại câu trả lời và sửa transcript  
> **So that** đảm bảo câu trả lời được ghi nhận chính xác

### US-STUDENT-006: Xem điểm kết quả
> **As a** Sinh viên  
> **I want to** xem điểm và kết quả thi của mình  
> **So that** tôi biết mình được bao nhiêu điểm

### US-STUDENT-007: Làm lại bài thi (nếu được phép)
> **As a** Sinh viên  
> **I want to** làm lại bài thi khi còn lượt  
> **So that** tôi có cơ hội cải thiện điểm

---

## 3. Use Cases

### UC-STUDENT-001: Đăng nhập hệ thống

| Thuộc tính | Mô tả |
|------------|--------|
| **UC-ID** | UC-STUDENT-001 |
| **Tên** | Đăng nhập hệ thống |
| **Actor** | Sinh viên |
| **Mô tả** | Sinh viên đăng nhập vào ứng dụng desktop |
| **Pre-condition** | Sinh viên có tài khoản |
| **Post-condition** | Sinh viên đăng nhập thành công |

#### Main Flow
1. Sinh viên mở ứng dụng OralAI Desktop
2. Sinh viên chọn máy chủ (server URL)
3. Sinh viên nhập username/password hoặc đăng nhập Google
4. Hệ thống xác thực và đăng nhập
5. Hệ thống hiển thị danh sách bài thi

#### Alternative Flows
- **AF-001.1:** Sai password → Hệ thống báo lỗi "Sai tài khoản hoặc mật khẩu"
- **AF-001.2:** Tài khoản bị khóa → Hệ thống báo lỗi "Tài khoản bị khóa"
- **AF-001.3:** Server không phản hồi → Hệ thống báo lỗi kết nối

---

### UC-STUDENT-002: Xem danh sách bài thi

| Thuộc tính | Mô tả |
|------------|--------|
| **UC-ID** | UC-STUDENT-002 |
| **Tên** | Xem danh sách bài thi |
| **Actor** | Sinh viên |
| **Mô tả** | Sinh viên xem các bài thi được giao cho mình |
| **Pre-condition** | Sinh viên đã đăng nhập |
| **Post-condition** | Danh sách bài thi được hiển thị |

#### Main Flow
1. Sau khi đăng nhập, hệ thống hiển thị danh sách bài thi
2. Sinh viên xem: tên bài thi, môn học, thời gian, trạng thái
3. Sinh viên chọn bài thi để làm

#### Trạng thái hiển thị
| Trạng thái | Ý nghĩa |
|------------|----------|
| **Sẵn sàng** | Bài thi đã được giao, có thể làm |
| **Đã nộp** | Đã nộp bài, chờ kết quả |
| **Hoàn thành** | Đã có kết quả |
| **Hết hạn** | Đã quá thời gian thi |

#### Alternative Flows
- **AF-002.1:** Không có bài thi nào → Hiển thị "Không có bài thi nào được giao"

---

### UC-STUDENT-003: Kiểm tra thiết bị

| Thuộc tính | Mô tả |
|------------|--------|
| **UC-ID** | UC-STUDENT-003 |
| **Tên** | Kiểm tra thiết bị |
| **Actor** | Sinh viên |
| **Mô tả** | Sinh viên kiểm tra camera và microphone trước khi thi |
| **Pre-condition** | Sinh viên đã chọn bài thi |
| **Post-condition** | Thiết bị được kiểm tra và sẵn sàng |

#### Main Flow
1. Sinh viên chọn bài thi → "Mở bài thi"
2. Hệ thống yêu cầu quyền camera và microphone
3. Sinh viên cấp quyền
4. Hệ thống hiển thị camera preview, microphone test và thanh điều chỉnh Gain ($-12\text{ dB}$ đến $+18\text{ dB}$, mặc định 0)
5. Sinh viên bấm kiểm tra âm thanh 10 giây:
   - 3 giây đầu: Giữ im lặng để đo tạp âm nền (lấy tín hiệu trước Gain)
   - 7 giây sau: Nói thử để kiểm tra tín hiệu microphone
6. Sinh viên nghe lại bản thu thử (có thể bật/tắt thử lọc nhiễu RNNoise để so sánh)
7. Nếu âm lượng quá nhỏ/lớn, sinh viên chỉnh thanh Gain (hệ thống cảnh báo hạ Gain nếu âm lượng sau gain vượt $-1\text{ dBFS}$)
8. Khi âm thanh đạt chuẩn, sinh viên bấm "Bắt đầu thi" (thanh Gain và thiết bị sẽ bị khóa trong suốt lúc thi)

#### Alternative Flows
- **AF-003.1:** Camera không tìm thấy → Hệ thống yêu cầu cắm camera
- **AF-003.2:** Microphone không có tín hiệu (toàn bộ 10s không đạt $\ge -90\text{ dBFS}$) → Hệ thống cảnh báo mic hỏng
- **AF-003.3:** Độ ồn quá cao ($\ge 20\%$ cửa sổ đo trong 3s đầu $\ge -40\text{ dBFS}$) → Hệ thống cảnh báo tìm nơi yên tĩnh
- **AF-003.4:** Sinh viên bấm bỏ qua kiểm tra → Hệ thống cho phép bắt đầu (không ghi nhận quyết định bỏ qua lên server)

---

### UC-STUDENT-004: Làm bài thi vấn đáp

| Thuộc tính | Mô tả |
|------------|--------|
| **UC-ID** | UC-STUDENT-004 |
| **Tên** | Làm bài thi vấn đáp |
| **Actor** | Sinh viên |
| **Mô tả** | Sinh viên trả lời từng câu hỏi bằng giọng nói |
| **Pre-condition** | Thiết bị đã kiểm tra, bài thi sẵn sàng |
| **Post-condition** | Tất cả câu trả lời được nộp |

#### Main Flow
1. Hệ thống hiển thị câu hỏi hiện tại
2. Sinh viên bấm "Bắt đầu trả lời"
3. Hệ thống bắt đầu ghi âm và ghi hình
4. Sinh viên nói câu trả lời
5. Sinh viên bấm "Kết thúc trả lời"
6. Hệ thống dừng ghi → PhoWhisper STT → hiển thị transcript
7. Sinh viên nghe lại và sửa transcript nếu cần (hoặc thử STT lại)
8. Sinh viên bấm "Nộp câu trả lời & tiếp tục"
9. Hệ thống chuyển câu hỏi tiếp theo
10. Lặp lại cho đến khi hết câu hỏi
11. Sinh viên bấm "Nộp bài thi"
12. Hệ thống nộp bài và hiển thị "Đang chấm điểm"

#### Alternative Flows
- **AF-004.1 (Bảo vệ phòng thi - Unload Guard):** Sinh viên vô tình bấm đóng cửa sổ hoặc reload khi ca thi đang `IN_PROGRESS` $\rightarrow$ Hệ thống hiển thị hộp thoại cảnh báo: *"Bạn còn bản ghi chưa nộp. Thoát sẽ mất dữ liệu."* và bắt buộc chọn "Ở lại".
- **AF-004.2:** Mất kết nối mạng $\rightarrow$ Hệ thống lưu media local trong IndexedDB/Storage, tự động nộp lại khi có mạng
- **AF-004.3:** Quá thời gian quy định $\rightarrow$ Hệ thống tự động nộp bài

#### Ghi chú quan trọng
- Camera và microphone được mở sẵn để giảm delay
- **MediaRecorder chỉ bắt đầu ghi khi sinh viên bấm "Bắt đầu trả lời"**
- Audio được STT bằng PhoWhisper local (không upload lên server trước)

---

### UC-STUDENT-005: Nghe lại và sửa transcript

| Thuộc tính | Mô tả |
|------------|--------|
| **UC-ID** | UC-STUDENT-005 |
| **Tên** | Nghe lại và sửa transcript |
| **Actor** | Sinh viên |
| **Mô tả** | Sinh viên nghe lại câu trả lời, thử STT lại hoặc sửa transcript trước khi nộp |
| **Pre-condition** | Đã có transcript từ STT |
| **Post-condition** | Transcript được xác nhận và nộp lên hệ thống |

#### Main Flow
1. Sau khi dừng ghi, hệ thống hiển thị transcript và audio player
2. Sinh viên nghe lại bản ghi âm câu trả lời
3. Sinh viên so sánh giọng nói thực tế với transcript
4. Sinh viên có thể chọn giữa bản audio gốc hoặc bản RNNoise để bấm "Thử STT lại" nếu cần
5. Sinh viên sửa lỗi chính tả trực tiếp trên ô transcript nếu STT nhận nhầm
6. Sinh viên bấm "Nộp câu trả lời & tiếp tục"

#### Tùy chọn bản ghi
| Tùy chọn | Mô tả |
|----------|--------|
| **Bản gốc** | Audio thu âm thực tế (áp dụng Gain). Luôn được chọn làm file upload lưu trữ pháp lý |
| **Bản giảm nhiễu RNNoise** | Audio đã lọc nhiễu qua AudioWorklet 48kHz; dùng để thử nhận dạng lại khi phòng có tiếng ồn nền |

#### Alternative Flows & Cơ chế Giám sát Chống Gian Lận (Tamper Flag)
- **AF-005.1 (Sửa transcript thủ công):** Sinh viên sửa văn bản transcript khác với kết quả STT gốc gần nhất $\rightarrow$ **Hệ thống tự động gán `stt_confidence = 0`**. Backend phát hiện `stt_confidence < 0.70` sẽ **tự động bật cờ `review_required = True`** bắt buộc Giảng viên phải nghe lại audio đối soát trước khi công nhận điểm.
- **AF-005.2 (Thử STT lại):** Sinh viên chọn bản gốc hoặc bản RNNoise $\rightarrow$ Bấm "Thử STT lại" $\rightarrow$ Kết quả mới thay thế transcript hiện tại (cần thử lại trước khi chỉnh sửa tay).


---

### UC-STUDENT-006: Xem điểm kết quả

| Thuộc tính | Mô tả |
|------------|--------|
| **UC-ID** | UC-STUDENT-006 |
| **Tên** | Xem điểm kết quả |
| **Actor** | Sinh viên |
| **Mô tả** | Sinh viên xem điểm và kết quả thi |
| **Pre-condition** | Bài thi đã được chấm xong |
| **Post-condition** | Sinh viên xem được điểm chi tiết |

#### Main Flow
1. Sinh viên đăng nhập desktop
2. Hệ thống hiển thị bài thi đã hoàn thành
3. Sinh viên chọn bài thi
4. Hệ thống hiển thị:
   - Điểm tổng
   - Điểm từng câu
   - Trạng thái: đã duyệt / chờ duyệt

#### Alternative Flows
- **AF-006.1:** Chưa có điểm → Hiển thị "Đang chấm điểm"
- **AF-006.2:** Điểm bị review → Hiển thị "Chờ giảng viên duyệt"

---

### UC-STUDENT-007: Làm lại bài thi

| Thuộc tính | Mô tả |
|------------|--------|
| **UC-ID** | UC-STUDENT-007 |
| **Tên** | Làm lại bài thi |
| **Actor** | Sinh viên |
| **Mô tả** | Sinh viên làm lại bài thi khi còn lượt |
| **Pre-condition** | Bài thi cho phép làm lại và còn lượt |
| **Post-condition** | Lượt thi mới được tạo |

#### Main Flow
1. Sinh viên xem bài thi đã nộp
2. Sinh viên bấm "Làm lại bài thi"
3. Hệ thống kiểm tra số lượt còn lại
4. Hệ thống tạo lượt thi mới
5. Sinh viên làm bài như bình thường (UC-STUDENT-004)

#### Alternative Flows
- **AF-007.1:** Không còn lượt → Hệ thống báo "Đã hết lượt thi"
- **AF-007.2:** Không cho phép làm lại → Nút "Làm lại" không hiển thị

#### Cấu hình số lần làm lại
| Cấu hình | Ý nghĩa |
|----------|----------|
| Không cho làm lại | 1 lượt duy nhất |
| Cho thêm N lần | Tổng cộng N+1 lượt |
| Không giới hạn | Thi thoải mái |

---

### UC-STUDENT-008: Xem lịch sử các lần thi

| Thuộc tính | Mô tả |
|------------|--------|
| **UC-ID** | UC-STUDENT-008 |
| **Tên** | Xem lịch sử các lần thi |
| **Actor** | Sinh viên |
| **Mô tả** | Sinh viên xem kết quả của các lần thi trước |
| **Pre-condition** | Sinh viên đã thi nhiều lần |
| **Post-condition** | Lịch sử thi được hiển thị |

#### Main Flow
1. Sinh viên chọn bài thi đã hoàn thành
2. Sinh viên chọn "Xem lần N" (N = 1, 2, 3...)
3. Hệ thống hiển thị kết quả của lần thi đó

---

## 4. Bảng tổng hợp Use Cases

| UC-ID | Tên Use Case | Pre-condition | Post-condition |
|-------|--------------|--------------|----------------|
| UC-STUDENT-001 | Đăng nhập hệ thống | Có tài khoản | Đăng nhập thành công |
| UC-STUDENT-002 | Xem danh sách bài thi | Đã đăng nhập | Danh sách được hiển thị |
| UC-STUDENT-003 | Kiểm tra thiết bị | Đã chọn bài thi | Thiết bị sẵn sàng |
| UC-STUDENT-004 | Làm bài thi vấn đáp | Thiết bị OK | Bài được nộp |
| UC-STUDENT-005 | Nghe lại và sửa transcript | Có transcript từ STT | Transcript được xác nhận |
| UC-STUDENT-006 | Xem điểm kết quả | Đã chấm xong | Điểm được hiển thị |
| UC-STUDENT-007 | Làm lại bài thi | Còn lượt | Lượt mới được tạo |
| UC-STUDENT-008 | Xem lịch sử các lần thi | Có nhiều lần thi | Lịch sử được hiển thị |

---

## 5. Luồng thi hoàn chỉnh

```
Sinh viên đăng nhập
        ↓
Xem danh sách bài thi
        ↓
Chọn bài thi → "Mở bài thi"
        ↓
Cấp quyền camera & microphone
        ↓
Kiểm tra thiết bị (camera preview, mic test)
        ↓
Bấm "Bắt đầu thi"
        ↓
┌───────────────────────────────────────────────────────────────┐
│  LẶP CHO MỖI CÂU HỎI:                                        │
│                                                               │
│  Hiển thị câu hỏi                                            │
│         ↓                                                     │
│  Bấm "Bắt đầu trả lời" → Ghi âm/ghi hình                    │
│         ↓                                                     │
│  Bấm "Kết thúc trả lời" → STT PhoWhisper → Transcript       │
│         ↓                                                     │
│  Nghe lại, sửa transcript (tùy chọn)                        │
│         ↓                                                     │
│  Bấm "Nộp câu trả lời & tiếp tục"                           │
└───────────────────────────────────────────────────────────────┘
        ↓
Bấm "Nộp bài thi"
        ↓
Chờ server chấm điểm (background)
        ↓
Xem kết quả
        ↓
[Làm lại bài thi nếu còn lượt]
```

---

## 6. Ghi chú kỹ thuật

### 6.1 Camera và Microphone
- Camera và microphone được mở sẵn trước khi thi để:
  - Hiển thị preview
  - Giảm delay khi bắt đầu trả lời
- **MediaRecorder chỉ bắt đầu ghi khi sinh viên bấm "Bắt đầu trả lời"**

### 6.2 STT Local
- PhoWhisper chạy local trên máy sinh viên
- Không cần upload audio lên server để STT
- Sinh viên có thể sửa transcript trước khi nộp

### 6.3 Upload Media
- Audio/video được upload lên server sau khi nộp
- Upload chạy background, không block sinh viên
- Hỗ trợ resume nếu mất kết nối
