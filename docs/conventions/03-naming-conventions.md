# Naming Conventions

## 1. Giới thiệu

Tài liệu này thống nhất cách đặt tên cho tất cả các thành phần trong dự án AI Oral Assessment Platform.

---

## 2. Tổng quan

| Loại | Convention | Ví dụ |
|------|-----------|--------|
| Component/Class | PascalCase | `ExamSession`, `QuestionCard` |
| Function/Variable | camelCase | `getExamById`, `studentList` |
| Constant | UPPER_SNAKE_CASE | `MAX_ATTEMPTS`, `API_TIMEOUT` |
| File (Python/TS) | snake_case | `exam_routes.py`, `student_list.tsx` |
| Database Table | snake_case, plural | `exam_sessions`, `question_attempts` |
| Database Column | snake_case | `created_at`, `exam_id` |
| API Endpoint | kebab-case | `/exam-sessions`, `/user-profiles` |
| Git Branch | type/description | `feat/add-rubric`, `fix/stt-timeout` |
| Commit Message | imperative | `feat: add rubric management` |

---

## 3. TypeScript / React

### 3.1 Files

```
components/
├── UserCard.tsx          # Component
├── userCard.module.css    # CSS Module
├── useUserData.ts        # Hook
└── user.types.ts        # Types/Interfaces

lib/
├── api.ts                # API utilities
├── auth.ts               # Auth utilities
└── formatDate.ts        # Helper functions
```

| Type | Convention | Example |
|------|------------|---------|
| Component file | PascalCase + `.tsx` | `ExamCard.tsx` |
| Hook file | camelCase + `use` prefix | `useAuth.ts` |
| Type file | kebab-case | `user-profile.ts` |
| CSS Module | camelCase | `examCard.module.css` |
| Utils file | camelCase | `formatDate.ts` |

### 3.2 Variables và Functions

```typescript
// ✅ Variables: camelCase
const userName = "John";
const examList = [];
const isLoading = false;
const hasError = true;

// ✅ Functions: camelCase, verb prefix
function getUserById(id: string) { }
function validateEmail(email: string) { }
function handleSubmit(event: FormEvent) { }
function onClick() { }

// ❌ Avoid
const UserName = "John";
const exam_list = [];
const getUserById = function() { };
```

### 3.3 Types và Interfaces

```typescript
// ✅ Interface: PascalCase, descriptive
interface UserProfile {
  id: string;
  name: string;
  email: string;
  role: UserRole;
}

// ✅ Type alias: PascalCase
type UserRole = "ADMIN" | "TEACHER" | "STUDENT";

// ✅ Enum: PascalCase, members UPPER_SNAKE
enum ExamStatus {
  DRAFT = "DRAFT",
  PUBLISHED = "PUBLISHED",
  ARCHIVED = "ARCHIVED",
}

// ✅ Props interface: ComponentName + Props
interface ExamCardProps {
  exam: Exam;
  onSelect?: (exam: Exam) => void;
}
```

### 3.4 Components

```typescript
// ✅ Component name: PascalCase
export function UserCard() { }
export function ExamList() { }
export function RubricEditor() { }

// ✅ Props destructured in parameter
function UserCard({ user, onEdit }: UserCardProps) {
  // ...
}

// ✅ Event handlers: handle prefix
function ExamCard({ exam, onSelect }: ExamCardProps) {
  const handleSelect = () => {
    onSelect?.(exam);
  };

  return <button onClick={handleSelect}>{exam.name}</button>;
}
```

---

## 4. Python / FastAPI

### 4.1 Files

```
app/
├── models/
│   ├── user.py
│   ├── exam.py
│   └── rubric.py
├── schemas/
│   ├── user.py
│   ├── exam.py
│   └── rubric.py
├── routers/
│   ├── users.py
│   ├── exams.py
│   └── rubrics.py
└── utils/
    ├── auth.py
    └── helpers.py
```

| Type | Convention | Example |
|------|------------|---------|
| Module | snake_case | `exam_routes.py` |
| Class | PascalCase | `class ExamSession:` |
| Function | snake_case | `def get_user_by_id():` |
| Variable | snake_case | `user_list = []` |
| Constant | UPPER_SNAKE_CASE | `MAX_RETRIES = 3` |

### 4.2 Variables và Functions

```python
# ✅ Variables: snake_case
user_name = "John"
exam_list = []
is_active = True
has_error = False

# ✅ Functions: snake_case, verb prefix
def get_user_by_id(user_id: str) -> User:
    ...

def validate_email(email: str) -> bool:
    ...

def create_exam(exam_data: ExamCreate) -> Exam:
    ...

# ❌ Avoid
UserName = "John"
examList = []
def GetUserById():
    ...
```

### 4.3 Classes

```python
# ✅ Class: PascalCase
class ExamSession:
    ...

class QuestionAttempt:
    ...

class UserRepository:
    ...
```

### 4.4 Constants

```python
# ✅ Constants: UPPER_SNAKE_CASE
MAX_RETRY_ATTEMPTS = 3
API_TIMEOUT_SECONDS = 30
DEFAULT_PAGE_SIZE = 100

# ✅ Module-level constants
DEFAULT_STATUS = "ACTIVE"
EXAM_STATUS_DRAFT = "DRAFT"
EXAM_STATUS_PUBLISHED = "PUBLISHED"
```

---

## 5. Database

### 5.1 Tables

| Entity | Table Name | Example |
|--------|------------|---------|
| User | users | `SELECT * FROM users` |
| Exam | exams | `SELECT * FROM exams` |
| Exam Session | exam_sessions | `SELECT * FROM exam_sessions` |
| Question Attempt | question_attempts | `SELECT * FROM question_attempts` |

```
# ✅ Naming convention
users
user_sessions
course_enrollments
exam_blueprints

# ❌ Avoid
User
UserSession
user_sessions
examSession
```

### 5.2 Columns

```sql
-- ✅ snake_case
id
user_id
created_at
updated_at
exam_status
question_content

-- ❌ Avoid
userId
CreatedAt
ExamStatus
questionContent
```

### 5.3 Primary Key

```sql
-- ✅ Primary key: id (UUID string)
id VARCHAR(36) PRIMARY KEY

-- Foreign keys: referenced_table_singular_id
user_id REFERENCES users(id)
exam_id REFERENCES exams(id)
```

### 5.4 Indexes

```sql
-- ✅ Index naming: idx_table_column(s)
CREATE INDEX idx_exam_sessions_user_id ON exam_sessions(user_id);
CREATE INDEX idx_exam_sessions_exam_id ON exam_sessions(exam_id);
CREATE INDEX idx_question_attempts_session_id ON question_attempts(session_id);

-- Unique constraints
CREATE UNIQUE INDEX uq_user_username ON users(username);
```

---

## 6. API Endpoints

### 6.1 REST Conventions

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/exams` | List all exams |
| GET | `/exams/{id}` | Get single exam |
| POST | `/exams` | Create exam |
| PUT | `/exams/{id}` | Update exam |
| DELETE | `/exams/{id}` | Delete exam |
| PATCH | `/exams/{id}/publish` | Partial action |

### 6.2 Endpoint Naming

```
# ✅ Resource-based, lowercase, plural nouns
/exams
/exam-sessions
/question-attempts
/user-profiles

# ❌ Avoid
/GetExams
/get_exams
/GetExamsByUser
/exam
```

### 6.3 Examples

```typescript
// ✅ Good endpoints
GET    /api/v1/exams
GET    /api/v1/exams/:id
POST   /api/v1/exams
PUT    /api/v1/exams/:id
DELETE /api/v1/exams/:id
POST   /api/v1/exams/:id/publish
POST   /api/v1/exams/:id/clone

GET    /api/v1/users/:id/enrollments
POST   /api/v1/exam-sessions/:id/submit

// ❌ Avoid
GET /api/v1/getExams
GET /api/v1/get_exam_by_id
POST /api/v1/createExam
```

### 6.4 Query Parameters

```typescript
// ✅ Query params: camelCase for filters, snake_case for API
GET /exams?page=1&limit=20
GET /exams?status=PUBLISHED
GET /exams?sort_by=created_at&order=desc

// ❌ Avoid
GET /exams?Page=1&LIMIT=20
GET /exams?Status=PUBLISHED
```

---

## 7. Git

### 7.1 Branches

```
# ✅ Branch naming: type/description

# Features
feat/add-rubric-management
feat/user-enrollment-system
feat/english-terms-suggestion

# Bug fixes
fix/stt-timeout-error
fix/upload-retry-issue
fix/null-pointer-exam-session

# Refactoring
refactor/extract-user-repository
refactor/ai-grading-pipeline

# Documentation
docs/update-api-documentation
docs/add-user-guide

# Chores
chore/upgrade-dependencies
chore/update-docker-image

# ❌ Avoid
new-feature
bug_fix
fixbug
Feature
```

### 7.2 Commit Messages

Sử dụng [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <description>

[optional body]

[optional footer]
```

**Types:**

| Type | Description |
|------|-------------|
| `feat` | New feature |
| `fix` | Bug fix |
| `docs` | Documentation changes |
| `style` | Code style (formatting, no logic change) |
| `refactor` | Code refactoring |
| `test` | Adding or updating tests |
| `chore` | Maintenance tasks |
| `perf` | Performance improvements |

**Examples:**

```bash
# ✅ Good commits
feat(exam): add rubric selection during exam creation
feat(stt): integrate PhoWhisper for local transcription
fix(upload): handle chunk upload timeout
fix(auth): resolve token refresh race condition
docs(api): update endpoint documentation
refactor(grading): extract RAG retrieval logic
test(exam): add integration tests for exam submission
chore(deps): upgrade fastapi to 0.115.0

# ❌ Avoid
Fixed bug
Update
WIP
asdf
test
```

### 7.3 Pull Request Titles

```
feat(exam): add rubric management for teachers
fix(stt): handle timeout during audio transcription  
refactor(grading): improve confidence threshold logic
docs(user-guide): update exam creation walkthrough
```

---

## 8. Error Codes

### 8.1 Error Code Format

```
{ENTITY}_{ERROR_TYPE}

Examples:
- USER_NOT_FOUND
- EXAM_NOT_FOUND
- INVALID_TOKEN
- PERMISSION_DENIED
- VALIDATION_ERROR
```

### 8.2 Common Error Codes

| Domain | Error Codes |
|--------|-------------|
| Auth | `INVALID_CREDENTIALS`, `INVALID_TOKEN`, `TOKEN_EXPIRED`, `PERMISSION_DENIED` |
| User | `USER_NOT_FOUND`, `USER_ALREADY_EXISTS`, `INVALID_ROLE` |
| Exam | `EXAM_NOT_FOUND`, `EXAM_NOT_PUBLISHED`, `EXAM_IN_USE` |
| Session | `SESSION_NOT_FOUND`, `SESSION_EXPIRED`, `SESSION_IN_PROGRESS` |
| Upload | `UPLOAD_FAILED`, `CHUNK_MISSING`, `INVALID_FILE_TYPE` |
| Grading | `GRADING_FAILED`, `CONFIDENCE_LOW`, `RAG_RETRIEVAL_FAILED` |

---

## 9. Environment Variables

```
# ✅ Naming: UPPER_SNAKE_CASE, descriptive prefix

# Database
DATABASE_URL
POSTGRES_USER
POSTGRES_PASSWORD

# Authentication
JWT_SECRET
JWT_ALGORITHM
ACCESS_TOKEN_EXPIRE_MINUTES

# AI/ML
AI_PROVIDER
GEMINI_API_KEY
LLM_MODEL
EMBEDDING_MODEL

# Storage
STORAGE_ENDPOINT
STORAGE_ACCESS_KEY
STORAGE_BUCKET

# ❌ Avoid
db_url
secret
api_key
token
```

---

## 10. Quick Reference

### TypeScript

```typescript
// Variables
const userName = "";
let examCount = 0;

// Functions
function getUserById() { }
function handleClick() { }

// Types
interface UserProfile { }
type UserRole = "ADMIN" | "TEACHER";

// Components
function UserCard() { }
function ExamList() { }
```

### Python

```python
# Variables
user_name = ""
exam_count = 0

# Functions
def get_user_by_id():
    pass

# Classes
class UserProfile:
    pass

class ExamRepository:
    pass

# Constants
MAX_RETRY = 3
API_TIMEOUT = 30
```

### SQL

```sql
-- Tables
users
exam_sessions
question_attempts

-- Columns
user_id
created_at
exam_status
```
