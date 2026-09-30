# Actor: Admin hệ thống (System Admin)

## 1. Actor Profile

| Thuộc tính | Mô tả |
|------------|--------|
| **Vai trò** | `SYSTEM_ADMIN`
| **Mô tả** | Người cấu hình hệ thống và phân quyền người dùng |
| **Phạm vi quyền hạn** | Toàn bộ hệ thống, bao gồm cấu hình kỹ thuật |

---

## 2. User Stories

### US-SYSADMIN-001: Cấu hình AI Provider
> **As a** System Admin  
> **I want to** cấu hình AI provider (Gemini/Ollama) và các thông số  
> **So that** hệ thống có thể sinh câu hỏi và chấm điểm

### US-SYSADMIN-002: Cấu hình STT Provider
> **As a** System Admin  
> **I want to** cấu hình STT provider cho server (Gemini STT/Google Cloud STT)  
> **So that** server có thể nhận dạng giọng nói khi cần

### US-SYSADMIN-003: Cấu hình OAuth/Google Login
> **As a** System Admin  
> **I want to** cấu hình OAuth provider cho đăng nhập Google  
> **So that** người dùng có thể đăng nhập bằng Google

### US-SYSADMIN-004: Phân quyền người dùng
> **As a** System Admin  
> **I want to** gán vai trò (ADMIN, TEACHER, STUDENT) cho tài khoản  
> **So that** người dùng có quyền truy cập phù hợp

### US-SYSADMIN-005: Quản lý storage
> **As a** System Admin  
> **I want to** quản lý object storage (MinIO/S3)  
> **So that** hệ thống lưu trữ media và documents đúng cách

### US-SYSADMIN-006: Monitoring hệ thống
> **As a** System Admin  
> **I want to** theo dõi logs và trạng thái hệ thống  
> **So that** có thể phát hiện và xử lý lỗi

### US-SYSADMIN-007: Quản lý database
> **As a** System Admin  
> **I want to** quản lý database migrations và backup  
> **So that** dữ liệu được bảo toàn và hệ thống hoạt động đúng

---

## 3. Use Cases

### UC-SYSADMIN-001: Cấu hình AI Provider

| Thuộc tính | Mô tả |
|------------|--------|
| **UC-ID** | UC-SYSADMIN-001 |
| **Tên** | Cấu hình AI Provider |
| **Actor** | System Admin |
| **Mô tả** | Admin cấu hình AI provider để sinh câu hỏi và chấm điểm |
| **Pre-condition** | Admin đã đăng nhập với quyền cao nhất |
| **Post-condition** | AI provider được cấu hình và sẵn sàng sử dụng |

#### Supported Providers
| Provider | Mô tả |
|----------|--------|
| **Gemini** | Dùng Gemini API với API key |
| **Ollama (Local)** | Dùng Ollama chạy local với model local |

#### Configuration Options
| Tùy chọn | Gemini | Ollama |
|-----------|--------|--------|
| API Key / URL | ✅ | ✅ |
| Chat Model | ✅ | ✅ |
| Embedding Model | ✅ | ✅ |
| Timeout | ✅ | ✅ |

#### Main Flow
1. Admin vào "Cấu hình hệ thống" → "AI & Grading"
2. Admin chọn provider (Gemini/Ollama)
3. Admin nhập các thông số cần thiết
4. Admin bấm "Lưu cấu hình"
5. Hệ thống cập nhật và hiển thị trạng thái kết nối

#### Alternative Flows
- **AF-001.1:** Kết nối thất bại → Hệ thống báo lỗi chi tiết
- **AF-001.2:** Model không hỗ trợ → Hệ thống báo "Model không tương thích"

---

### UC-SYSADMIN-002: Cấu hình STT Provider

| Thuộc tính | Mô tả |
|------------|--------|
| **UC-ID** | UC-SYSADMIN-002 |
| **Tên** | Cấu hình STT Provider |
| **Actor** | System Admin |
| **Mô tả** | Admin cấu hình STT provider cho server |
| **Pre-condition** | Admin đã đăng nhập |
| **Post-condition** | STT provider được cấu hình |

#### STT Options (Server-side)
| Provider | Mô tả | Yêu cầu |
|----------|--------|----------|
| **Gemini STT** | Dùng Gemini API | API key |
| **Google Cloud STT** | Dùng Google Cloud Speech-to-Text | Service Account JSON |
| **Demo** | Không nhận dạng thật | Không |

#### Main Flow
1. Admin vào "Cấu hình hệ thống" → "STT & Giọng nói"
2. Admin chọn STT provider
3. Nếu Google Cloud STT → Upload service account JSON
4. Admin bấm "Lưu"
5. Hệ thống xác minh credentials

#### Ghi chú
- Desktop luôn dùng PhoWhisper local, không phụ thuộc cấu hình này
- Cấu hình STT server dùng cho:
  - STT từ trình duyệt web
  - Nhận dạng lại từ admin

---

### UC-SYSADMIN-003: Cấu hình OAuth/Google Login

| Thuộc tính | Mô tả |
|------------|--------|
| **UC-ID** | UC-SYSADMIN-003 |
| **Tên** | Cấu hình OAuth/Google Login |
| **Actor** | System Admin |
| **Mô tả** | Admin cấu hình OAuth provider cho đăng nhập |
| **Pre-condition** | Admin đã đăng nhập |
| **Post-condition** | OAuth được bật/tắt |

#### Supported OAuth
| Provider | Mô tả |
|----------|--------|
| **Google** | Đăng nhập bằng tài khoản Google |

#### Main Flow
1. Admin vào "Cấu hình hệ thống" → "OAuth"
2. Admin bật/tắt Google Login
3. Nếu bật → Admin nhập OAuth credentials
4. Admin bấm "Lưu"
5. Hệ thống cập nhật cấu hình

---

### UC-SYSADMIN-004: Phân quyền người dùng

| Thuộc tính | Mô tả |
|------------|--------|
| **UC-ID** | UC-SYSADMIN-004 |
| **Tên** | Phân quyền người dùng |
| **Actor** | System Admin |
| **Mô tả** | Admin gán và thay đổi vai trò của tài khoản |
| **Pre-condition** | Admin đã đăng nhập |
| **Post-condition** | Vai trò được cập nhật |

#### Vai trò hệ thống
| Vai trò | Quyền hạn |
|---------|-----------|
| **ADMIN** | Quản lý kỳ thi, môn học, sinh viên, xem kết quả (tương ứng vai trò Khảo thí / Examiner) |
| **TEACHER** | Ra đề chuẩn dùng chung, giao bài cho lớp, chấm điểm, chấm phúc khảo |
| **STUDENT** | Làm bài thi, kiểm tra mic, đối soát transcript, xem điểm cá nhân |
| **SYSTEM_ADMIN** | Cấu hình hạ tầng AI/STT, phân quyền người dùng, quản trị kỹ thuật |

> **Ghi chú phân định vai trò:** Vai trò **ADMIN** trong bảng quyền hạn hệ thống trên đại diện cho Cán bộ Khảo thí / Quản trị đào tạo (Actor trong `02-actor-admin.md`). Còn **SYSTEM_ADMIN** là Quản trị viên kỹ thuật toàn hệ thống (IT System Admin).

#### Main Flow
1. Admin vào "Người dùng"
2. Admin chọn tài khoản cần thay đổi
3. Admin chọn vai trò mới
4. Admin bấm "Lưu"
5. Hệ thống cập nhật vai trò

---

### UC-SYSADMIN-005: Quản lý Storage & Dọn rác Media

| Thuộc tính | Mô tả |
|------------|--------|
| **UC-ID** | UC-SYSADMIN-005 |
| **Tên** | Quản lý Storage & Dọn rác Media |
| **Actor** | System Admin |
| **Mô tả** | Admin theo dõi dung lượng và quản lý hàng đợi dọn dẹp object storage (MinIO/S3) |
| **Pre-condition** | Admin đã đăng nhập |
| **Post-condition** | Storage được giám sát, rác media được dọn dẹp |

#### Main Flow
1. Admin vào "Cấu hình hệ thống" → "Storage"
2. Admin xem dung lượng sử dụng và số lượng files
3. Admin có thể xem danh sách files media gần đây
4. Admin có thể kích hoạt hoặc kiểm tra hàng đợi dọn rác bất đồng bộ (`media_cleanup`)
5. Worker tự động xóa vĩnh viễn các file media trên MinIO khi môn học hoặc ca thi bị xóa để giải phóng dung lượng

#### Monitoring
| Metric | Mô tả |
|--------|--------|
| Total Storage | Tổng dung lượng |
| Used Storage | Dung lượng đã dùng |
| File Count | Số lượng files |
| Cleanup Queue | Số lượng files đang chờ dọn rác |


---

### UC-SYSADMIN-006: Monitoring hệ thống

| Thuộc tính | Mô tả |
|------------|--------|
| **UC-ID** | UC-SYSADMIN-006 |
| **Tên** | Monitoring hệ thống |
| **Actor** | System Admin |
| **Mô tả** | Admin theo dõi logs và trạng thái hệ thống |
| **Pre-condition** | Admin đã đăng nhập |
| **Post-condition** | Logs được xem |

#### Log Types
| Type | Mô tả |
|------|--------|
| **API Logs** | Request/response logs |
| **Worker Logs** | Background job logs |
| **AI Logs** | AI request/response logs |
| **Audit Logs** | User action logs |

#### Main Flow
1. Admin vào "Cấu hình hệ thống" → "Logs"
2. Admin xem logs theo thời gian, loại, user
3. Admin có thể filter logs
4. Admin có thể export logs

---

### UC-SYSADMIN-007: Quản lý Database

| Thuộc tính | Mô tả |
|------------|--------|
| **UC-ID** | UC-SYSADMIN-007 |
| **Tên** | Quản lý Database |
| **Actor** | System Admin |
| **Mô tả** | Admin quản lý database migrations và backup |
| **Pre-condition** | Admin có quyền truy cập database |
| **Post-condition** | Database được backup và migrations chạy đúng |

#### Main Flow
1. Admin chạy migration qua Docker command
2. Admin kiểm tra migration status
3. Admin backup database định kỳ

#### Backup Strategy
- **Frequency:** Hàng ngày
- **Retention:** 30 ngày
- **Storage:** Object storage riêng

---

## 4. Bảng tổng hợp Use Cases

| UC-ID | Tên Use Case | Pre-condition | Post-condition |
|-------|--------------|--------------|----------------|
| UC-SYSADMIN-001 | Cấu hình AI Provider | Có quyền admin | AI provider được cấu hình |
| UC-SYSADMIN-002 | Cấu hình STT Provider | Có quyền admin | STT provider được cấu hình |
| UC-SYSADMIN-003 | Cấu hình OAuth | Có quyền admin | OAuth được bật/tắt |
| UC-SYSADMIN-004 | Phân quyền người dùng | Có quyền admin | Vai trò được cập nhật |
| UC-SYSADMIN-005 | Quản lý Storage | Có quyền admin | Storage được giám sát |
| UC-SYSADMIN-006 | Monitoring hệ thống | Có quyền admin | Logs được xem |
| UC-SYSADMIN-007 | Quản lý Database | Có quyền admin | DB được backup |

---

## 5. Cấu hình hệ thống qua Environment Variables

### AI Configuration
```dotenv
# AI Provider Selection
AI_CONFIG_SOURCE=env  # or "admin" for web-configured

# Gemini
AI_PROVIDER=gemini
GEMINI_API_KEY=your-key
LLM_MODEL=gemini-2.5-flash
EMBEDDING_MODEL=gemini-embedding-001

# Ollama Local
AI_PROVIDER=local
LOCAL_LLM_URL=http://host.docker.internal:11434
LOCAL_LLM_TIMEOUT=180
LLM_MODEL=qwen3:8b
EMBEDDING_MODEL=nomic-embed-text
```

### STT Configuration
```dotenv
# Server-side STT (for browser/web)
# Gemini STT
GEMINI_STT_MODEL=gemini-2.5-flash

# Google Cloud STT - configured via web admin
```

### OAuth Configuration
```dotenv
# OAuth credentials - configured via web admin
```

### Storage Configuration
```dotenv
STORAGE_ENDPOINT=localhost:9000
STORAGE_ACCESS_KEY=minioadmin
STORAGE_SECRET_KEY=minioadmin
STORAGE_BUCKET=oral-ai
```

---

## 6. Ghi chú bảo mật

### 6.1 Credentials Management
- API keys và secrets **không được** lưu trong Git
- Credentials được lưu trong `.env` (không commit)
- Production dùng secret manager

### 6.2 Electron Security
- `contextIsolation = true`
- `nodeIntegration = false`
- `sandbox = true`
- Không expose `fs`, `child_process`, `shell` cho renderer

### 6.3 API Security
- JWT authentication
- Role-based access control (RBAC)
- Rate limiting
- Audit logging
