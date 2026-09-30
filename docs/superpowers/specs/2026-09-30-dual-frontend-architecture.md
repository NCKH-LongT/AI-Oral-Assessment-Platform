# Dual-Frontend Architecture Specification

**Project:** AI Oral Assessment Platform
**Date:** 2026-09-30
**Status:** Approved for Implementation
**Authors:** Development Team

---

## 1. Executive Summary

Tách hệ thống frontend hiện tại thành **2 phân hệ độc lập**:

| Phân hệ | Công nghệ | Mục đích | Deployment |
|---------|-----------|-----------|------------|
| **Student App** | React + Vite + Electron | Thi vấn đáp với STT local | Desktop app (.exe) |
| **Staff Portal** | Next.js + RBAC | Quản lý, chấm bài, cấu hình | Web (cloud/server) |

**Nguyên tắc:**
- Mỗi phiên thi là một transaction online hoàn chỉnh: đăng nhập → thi → nộp → xem kết quả
- Không cần offline, không cần cache credentials
- Hệ thống tập trung cho việc thi trước tiên

---

## 2. Architecture Overview

### 2.1 High-Level Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              USERS                                           │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│    ┌─────────────────────────────┐      ┌──────────────────────────────┐    │
│    │   STUDENT APP (Electron)   │      │   STAFF PORTAL (Next.js)     │    │
│    │                            │      │                              │    │
│    │   - Login (Google/Pass)   │      │   - SYSTEM_ADMIN            │    │
│    │   - View assigned exams   │      │   - EXAMINER               │    │
│    │   - Device check          │      │   - TEACHER                 │    │
│    │   - Record & STT local   │      │                              │    │
│    │   - Upload evidence       │      │   RBAC-gated routes         │    │
│    │   - View results          │      │                              │    │
│    └──────────────┬────────────┘      └──────────────┬───────────────┘    │
│                   │                                     │                   │
└───────────────────┼─────────────────────────────────────┼───────────────────┘
                    │                                     │
                    │ HTTPS (REST API + WebSocket)        │
                    │                                     │
                    ▼                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           REVERSE PROXY (Nginx)                              │
│                      /api/*  →  Backend API                                    │
└──────────────────────────────────┬────────────────────────────────────────────┘
                                   │
                    ┌──────────────┴──────────────┐
                    ▼                              ▼
┌──────────────────────────┐      ┌──────────────────────────┐
│      FASTAPI BACKEND      │      │      MINIO STORAGE       │
│                          │      │                          │
│  - JWT Authentication    │      │  - Audio files           │
│  - RBAC Authorization    │      │  - Video files           │
│  - AI Services (Grading) │      │  - Documents             │
│  - PostgreSQL + pgvector │      │                          │
└──────────────────────────┘      └──────────────────────────┘
```

### 2.2 Repository Structure

```
AI-Oral-Assessment-Platform/
├── apps/
│   ├── packages/                    # Shared packages (NEW)
│   │   └── shared/
│   │       ├── package.json
│   │       ├── tsconfig.json
│   │       └── src/
│   │           ├── types/          # Shared TypeScript interfaces
│   │           │   └── index.ts
│   │           ├── api-client/     # Shared API fetch logic
│   │           │   └── index.ts
│   │           └── utils/          # Shared utilities
│   │               └── index.ts
│   │
│   ├── student-app/                # Student Desktop App (NEW)
│   │   ├── src/
│   │   │   ├── components/        # UI components
│   │   │   ├── pages/            # Page components
│   │   │   ├── hooks/            # React hooks
│   │   │   ├── lib/              # Utilities
│   │   │   ├── electron/         # Electron main/preload
│   │   │   └── styles/          # CSS
│   │   ├── resources/             # Static assets, STT model
│   │   ├── package.json
│   │   ├── vite.config.ts
│   │   ├── electron-builder.yml
│   │   └── tsconfig.json
│   │
│   ├── staff-portal/               # Staff Web Portal (RENAME from admin-web)
│   │   ├── app/
│   │   │   ├── (auth)/           # Auth routes
│   │   │   ├── (admin)/          # ADMIN-only routes
│   │   │   ├── (examiner)/       # EXAMINER-only routes
│   │   │   ├── (teacher)/        # TEACHER-only routes
│   │   │   └── layout.tsx
│   │   ├── components/
│   │   ├── lib/
│   │   ├── package.json
│   │   └── next.config.ts
│   │
│   ├── desktop/                    # Legacy Electron app (DEPRECATE later)
│   │   └── ...
│   │
│   └── backend/                    # Backend API (EXISTING)
│       ├── app/
│       ├── routers/
│       └── ...
│
├── docs/
│   └── superpowers/
│       └── specs/
│           └── 2026-09-30-dual-frontend-architecture.md
│
├── tests/
│   └── e2e/
│       ├── student-app.spec.ts
│       └── staff-portal.spec.ts
│
├── package.json                     # Workspace root
└── pnpm-workspace.yaml             # PNPM workspace config
```

---

## 3. Student App Specification

### 3.1 Technology Stack

| Component | Technology | Version |
|-----------|------------|---------|
| UI Framework | React | 18.x |
| Build Tool | Vite | 5.x |
| Desktop Runtime | Electron | 28.x |
| Packaging | electron-builder | 24.x |
| STT Engine | PhoWhisper | INT8 quantized |
| Language | TypeScript | 5.x |
| Styling | CSS Modules / Tailwind | - |

### 3.2 Core Features

| Feature | Priority | Description |
|---------|----------|-------------|
| Login | P0 | Google OAuth + MSSV/Password |
| Exam List | P0 | View assigned exams with status |
| Device Check | P0 | Camera + Microphone verification |
| Recording | P0 | Audio/Video recording during exam |
| Local STT | P0 | PhoWhisper transcription |
| Upload | P0 | Chunked upload to MinIO |
| Results | P1 | View graded results |
| Settings | P2 | Audio gain, noise filter toggle |

### 3.3 User Flow

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                           STUDENT APP FLOW                                     │
└──────────────────────────────────────────────────────────────────────────────┘

    ┌─────────────┐
    │  OPEN APP   │
    └──────┬──────┘
           │
           ▼
    ┌─────────────────┐
    │     LOGIN       │
    │  ┌───────────┐  │
    │  │ Google    │  │────► Redirect to Google OAuth
    │  │  OAuth   │  │     Verify @student.school.edu.vn
    │  └───────────┘  │
    │  ┌───────────┐  │
    │  │ MSSV +    │  │────► POST /api/auth/login
    │  │ Password  │  │     Return JWT token
    │  └───────────┘  │
    └──────┬──────┘
           │ (No token cached after app close)
           ▼
    ┌─────────────────┐
    │   EXAM LIST     │◄─── GET /api/exams/available
    │                 │     JWT token in header
    │  ┌───────────┐  │
    │  │ Exam A    │──┼──► Device Check → Start Exam
    │  │ Status:P  │  │     (PUBLISHED)
    │  └───────────┘  │
    │  ┌───────────┐  │
    │  │ Exam B    │  │
    │  │ Status:D  │  │     (DRAFT - not visible)
    │  └───────────┘  │
    └──────┬──────┘
           │
           ▼
    ┌─────────────────┐
    │  DEVICE CHECK   │
    │                 │
    │  □ Camera OK    │
    │  □ Mic OK       │
    │  □ Noise check  │
    │                 │
    │ [Start Exam]───►│ (Proceed if all checks pass)
    └──────┬──────┘
           │
           ▼
    ┌─────────────────┐
    │   EXAM ROOM     │
    │                 │
    │  ┌───────────┐  │
    │  │ Question  │  │
    │  │ 1 of N    │  │
    │  └───────────┘  │
    │                 │
    │  [Record]──────►│ ─── Start MediaRecorder
    │                 │       ↓
    │                 │   ┌───────────────┐
    │                 │   │ PhoWhisper   │ ───► Local STT
    │                 │   │ (CPU)        │
    │                 │   └───────────────┘
    │                 │       ↓
    │                 │   Transcript shown
    │                 │       ↓
    │  [Submit]──────►│ ─── POST /api/attempts/:id/submit
    │                 │       ↓
    │                 │   Upload audio/video to MinIO
    │                 │       ↓
    │  Next Question ─┤
    │  └───────────┘  │
    └──────┬──────┘
           │
           ▼
    ┌─────────────────┐
    │   EXAM DONE     │
    │                 │
    │  Submitted N/N   │
    │  Questions       │
    │                 │
    │ [View Results]──►│ ─── GET /api/sessions/:id
    │                 │     (After grading complete)
    └─────────────────┘

    ┌─────────────┐
    │  CLOSE APP  │ ─── Token cleared from memory
    └─────────────┘     (No persistence)
```

### 3.4 Page Specifications

#### 3.4.1 Login Page (`/login`)

**URL:** N/A (Desktop app, no URL routing)

**Components:**
- Logo + App name
- Google OAuth button
- OR divider
- MSSV input field
- Password input field
- Login button

**API:**
```typescript
// Google OAuth
GET /api/auth/google/callback?code=xxx
Response: { user: User; token: string }

// Password Login
POST /api/auth/login
Body: { username: string; password: string }
Response: { user: User; token: string }
```

**Behavior:**
- Token stored in memory only (not localStorage)
- Redirect to Exam List on success
- Show error on failure

#### 3.4.2 Exam List Page (`/exams`)

**Components:**
- Header with user name + logout button
- Course filter dropdown
- Exam cards grid
- Practice exam badge
- Attempt history toggle

**API:**
```typescript
GET /api/exams/available
Headers: Authorization: Bearer <token>
Response: StudentExam[]
```

**Exam Card States:**
| Status | UI |
|--------|-----|
| `PUBLISHED` | Green badge, "Start" button |
| `IN_PROGRESS` | Yellow badge, "Continue" button |
| `SUBMITTED` | Blue badge, "View" button |
| `COMPLETED` | Green badge, shows score |

#### 3.4.3 Exam Room Page (`/exam/:sessionId`)

**Sections:**
1. **Header:** Exam name, Timer, Question progress (X/N)
2. **Main Area:**
   - Question text
   - Recording controls
   - Transcript display + edit
3. **Sidebar:**
   - Camera preview
   - Mic level meter
   - Device selectors
   - Evidence upload progress

**Recording Flow:**
```typescript
async function startRecording() {
  // 1. Request media permissions
  const stream = await navigator.mediaDevices.getUserMedia({
    video: true,
    audio: true
  });

  // 2. Start MediaRecorder (audio + video)
  const audioRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
  const videoRecorder = new MediaRecorder(stream, { mimeType: 'video/webm' });

  // 3. Record chunks
  audioRecorder.ondataavailable = (e) => audioChunks.push(e.data);
  videoRecorder.ondataavailable = (e) => videoChunks.push(e.data);

  // 4. Start both recorders
  audioRecorder.start(1000);
  videoRecorder.start(1000);
}

async function stopAndTranscribe() {
  // 1. Stop recorders
  audioRecorder.stop();
  videoRecorder.stop();

  // 2. Combine chunks into blobs
  const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
  const videoBlob = new Blob(videoChunks, { type: 'video/webm' });

  // 3. Run local STT via PhoWhisper
  const transcript = await window.electron.stt.transcribe(audioBlob);

  // 4. Show transcript for review
  setTranscript(transcript.text);
}
```

#### 3.4.4 Results Page (`/results/:sessionId`)

**Components:**
- Score display (X/10)
- Per-question breakdown
- Playback controls for audio/video
- Grading feedback from AI/teacher

### 3.5 STT Integration

**PhoWhisper Setup:**
```typescript
// In Electron preload script
contextBridge.exposeInMainWorld('electron', {
  stt: {
    transcribe: async (audioBuffer: ArrayBuffer): Promise<STTResult> => {
      // Call Python script with audio data
      const result = await ipcRenderer.invoke('stt:transcribe', audioBuffer);
      return result;
    }
  }
});

// In Electron main process
ipcMain.handle('stt:transcribe', async (event, audioBuffer) => {
  // Spawn Python process with PhoWhisper
  const python = spawn('python', ['transcribe.py', '--model', 'phowhisper-small-int8']);

  // Pipe audio to stdin
  python.stdin.write(Buffer.from(audioBuffer));
  python.stdin.end();

  // Return transcript from stdout
  return new Promise((resolve, reject) => {
    python.stdout.on('data', (data) => resolve(JSON.parse(data)));
    python.stderr.on('data', (data) => reject(data));
  });
});
```

### 3.6 Build & Distribution

**electron-builder.yml:**
```yaml
appId: com.oralai.student
productName: OralAI Student
copyright: Copyright 2024

directories:
  output: dist-electron
  buildResources: resources

files:
  - dist/**/*
  - resources/**/*

extraResources:
  - from: resources/stt/
    to: stt/
    filter:
      - "**/*"

win:
  target:
    - target: nsis
      arch:
        - x64
  icon: resources/icon.ico
  artifactName: "${productName}-${version}-Setup.${ext}"

nsis:
  oneClick: false
  perMachine: false
  allowToChangeInstallationDirectory: true
  deleteAppDataOnUninstall: true

mac:
  target:
    - target: dmg
      arch:
        - x64
        - arm64
  icon: resources/icon.icns

linux:
  target:
    - target: AppImage
      arch:
        - x64
  icon: resources/icon.png

publish:
  provider: github
  owner: your-org
  repo: AI-Oral-Assessment-Platform
```

**Distribution Flow:**
```bash
# 1. Developer pushes code
git push

# 2. CI builds and creates release
npm run build && npm run electron:build

# 3. Create GitHub Release
gh release create v1.0.0 \
  --title "OralAI Student v1.0.0" \
  --notes "First stable release"

# 4. Upload installer
gh release upload v1.0.0 dist-electron/*.exe

# 5. Admin shares download link with students
# https://github.com/org/repo/releases/download/v1.0.0/OralAI-Student-1.0.0-Setup.exe
```

---

## 4. Staff Portal Specification

### 4.1 Technology Stack

| Component | Technology | Version |
|-----------|------------|---------|
| Framework | Next.js | 14.x (App Router) |
| Language | TypeScript | 5.x |
| Styling | Tailwind CSS | 3.x |
| State | React hooks / Zustand | - |
| Auth | NextAuth.js / Custom JWT | - |

### 4.2 RBAC Model

**Roles:**

| Role | Code | Permissions |
|------|------|-------------|
| System Administrator | `SYSTEM_ADMIN` | Full system access, user management, system config |
| Examiner | `EXAMINER` | Exam management, student enrollment, scheduling, result approval |
| Teacher | `TEACHER` | Course management, RAG upload, rubric creation, grading |

**Role Relationships:**
- One user can have multiple roles
- Higher privilege role takes precedence
- If user is both EXAMINER and TEACHER, they see combined menu

### 4.3 Route Structure

```
staff-portal/app/
├── (auth)/
│   ├── login/
│   │   └── page.tsx
│   └── logout/
│       └── page.tsx
│
├── (shared)/                  # Routes visible to all authenticated users
│   └── dashboard/
│       └── page.tsx
│
├── (admin)/                  # SYSTEM_ADMIN only
│   ├── users/
│   │   ├── page.tsx         # User list
│   │   └── [id]/page.tsx    # User detail
│   ├── settings/
│   │   ├── page.tsx         # System settings
│   │   ├── ai/page.tsx      # AI provider config
│   │   ├── stt/page.tsx     # STT config
│   │   └── oauth/page.tsx   # OAuth config
│   └── audit/
│       └── page.tsx         # Audit logs
│
├── (examiner)/               # EXAMINER only
│   ├── exams/
│   │   ├── page.tsx         # Exam list
│   │   ├── [id]/page.tsx    # Exam detail
│   │   └── new/page.tsx     # Create exam
│   ├── schedule/
│   │   ├── page.tsx         # Schedule list
│   │   └── new/page.tsx     # Create schedule
│   ├── students/
│   │   ├── page.tsx         # Enrollment management
│   │   └── import/page.tsx  # Bulk import
│   └── results/
│       ├── page.tsx         # Results overview
│       └── [id]/page.tsx    # Session result
│
├── (teacher)/                # TEACHER only
│   ├── courses/
│   │   ├── page.tsx         # Course list
│   │   └── [id]/
│   │       ├── page.tsx     # Course detail
│   │       ├── knowledge/page.tsx    # RAG documents
│   │       ├── outcomes/page.tsx     # Learning outcomes
│   │       ├── topics/page.tsx        # Topics
│   │       ├── rubrics/page.tsx       # Rubrics
│   │       └── exams/page.tsx         # Course exams
│   ├── rubrics/
│   │   ├── page.tsx         # Rubric list
│   │   └── [id]/page.tsx    # Rubric detail
│   └── grading/
│       ├── page.tsx         # Pending grading list
│       └── [attemptId]/page.tsx  # Grade single attempt
│
├── layout.tsx                # Root layout (sidebar, header)
├── not-found.tsx
└── error.tsx
```

### 4.4 RBAC Implementation

**Middleware:**
```typescript
// middleware.ts
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const rolePermissions: Record<string, RegExp[]> = {
  SYSTEM_ADMIN: [
    /^\/admin\/.*/,
    /^\/users\/.*/,
    /^\/settings\/.*/,
  ],
  EXAMINER: [
    /^\/exams\/.*/,
    /^\/schedule\/.*/,
    /^\/students\/.*/,
    /^\/results\/.*/,
  ],
  TEACHER: [
    /^\/courses\/.*/,
    /^\/rubrics\/.*/,
    /^\/grading\/.*/,
  ],
};

export function middleware(request: NextRequest) {
  // Get user from cookie/header (set by API route)
  const userCookie = request.cookies.get('user');
  if (!userCookie) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  const user = JSON.parse(decodeURIComponent(userCookie.value));
  const path = request.nextUrl.pathname;

  // Check if path matches user's roles
  const hasAccess = user.roles.some((role: string) => {
    const patterns = rolePermissions[role] || [];
    return patterns.some(pattern => pattern.test(path));
  });

  if (!hasAccess) {
    return NextResponse.redirect(new URL('/unauthorized', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico|login).*)',
  ],
};
```

**Component-level guards:**
```typescript
// components/RoleGuard.tsx
'use client';

import { useUser } from '@/hooks/useUser';

export function RoleGuard({
  children,
  allowedRoles
}: {
  children: React.ReactNode;
  allowedRoles: string[];
}) {
  const { user } = useUser();

  if (!user || !allowedRoles.includes(user.role)) {
    return <AccessDenied />;
  }

  return <>{children}</>;
}

// Usage
<RoleGuard allowedRoles={['SYSTEM_ADMIN']}>
  <SystemSettingsPanel />
</RoleGuard>
```

### 4.5 Dynamic Sidebar

```typescript
// components/Sidebar.tsx
const menuItems: Record<string, MenuItem[]> = {
  SYSTEM_ADMIN: [
    { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/users', label: 'Người dùng', icon: Users },
    { href: '/settings', label: 'Cấu hình', icon: Settings },
    { href: '/audit', label: 'Nhật ký', icon: FileText },
  ],
  EXAMINER: [
    { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/exams', label: 'Kỳ thi', icon: ClipboardList },
    { href: '/schedule', label: 'Lịch thi', icon: Calendar },
    { href: '/students', label: 'Sinh viên', icon: GraduationCap },
    { href: '/results', label: 'Kết quả', icon: CheckCircle },
  ],
  TEACHER: [
    { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/courses', label: 'Môn học', icon: BookOpen },
    { href: '/rubrics', label: 'Rubric', icon: FileText },
    { href: '/grading', label: 'Chấm bài', icon: Star },
  ],
};

export function Sidebar() {
  const { user } = useUser();

  // Merge menus if user has multiple roles
  const items = user.roles.flatMap(role => menuItems[role] || []);
  const uniqueItems = deduplicateByHref(items);

  return (
    <nav>
      {uniqueItems.map(item => (
        <NavLink key={item.href} href={item.href}>
          <item.icon />
          {item.label}
        </NavLink>
      ))}
    </nav>
  );
}
```

---

## 5. Shared Package Specification

### 5.1 Package Structure

```
packages/shared/
├── package.json
├── tsconfig.json
└── src/
    ├── types/
    │   ├── index.ts
    │   ├── user.ts
    │   ├── exam.ts
    │   ├── course.ts
    │   └── assessment.ts
    │
    ├── api-client/
    │   ├── index.ts
    │   ├── client.ts
    │   ├── endpoints.ts
    │   └── errors.ts
    │
    └── utils/
        ├── index.ts
        ├── format.ts
        └── validation.ts
```

### 5.2 Shared Types

```typescript
// packages/shared/src/types/index.ts

// ===== User Types =====
export type UserRole = 'STUDENT' | 'TEACHER' | 'EXAMINER' | 'SYSTEM_ADMIN';

export interface User {
  id: string;
  username: string;
  email?: string;
  name: string;
  role: UserRole;
  created_at: number;
}

export interface Student extends User {
  role: 'STUDENT';
  student_id?: string;
}

// ===== Exam Types =====
export type ExamStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
export type SessionStatus =
  | 'DEVICE_CHECK'
  | 'IN_PROGRESS'
  | 'UPLOADING'
  | 'SUBMITTED'
  | 'REVIEW_REQUIRED'
  | 'COMPLETED';
export type AttemptStatus =
  | 'READY'
  | 'RECORDING'
  | 'PROCESSING'
  | 'SUBMITTED'
  | 'GRADED';

export interface Exam {
  id: string;
  name: string;
  course_id: string;
  course_name?: string;
  status: ExamStatus;
  time_limit: number;      // seconds
  question_count: number;
  rubric_id?: string;
  max_attempts?: number;
  practice?: boolean;
}

export interface StudentExam extends Exam {
  session_id?: string;
  status: SessionStatus;
  attempt_count: number;
  remaining_attempts?: number;
  can_start_new: boolean;
  history?: ExamSessionSummary[];
}

export interface ExamSession {
  id: string;
  exam_id: string;
  exam_name: string;
  user_id: string;
  status: SessionStatus;
  started_at?: number;
  time_limit: number;
  server_time: number;
  question_count: number;
  answered_count: number;
  current_attempt?: QuestionAttempt;
  attempt_number?: number;
  final_score?: number;
  grading_message?: string;
  practice: boolean;
}

export interface QuestionAttempt {
  id: string;
  sequence: number;
  text: string;
  status: AttemptStatus;
  transcript?: string;
  stt_confidence?: number;
}

// ===== Course Types =====
export interface Course {
  id: string;
  code: string;
  name: string;
  description?: string;
  status: 'ACTIVE' | 'ARCHIVED';
  created_at: number;
}

export interface LearningOutcome {
  id: string;
  code: string;
  description: string;
  weight: number;
  course_id: string;
}

export interface Topic {
  id: string;
  name: string;
  course_id: string;
  outcome_ids: string[];
}

// ===== Rubric Types =====
export interface Rubric {
  id: string;
  name: string;
  version: number;
  course_id: string;
  criteria: Criterion[];
}

export interface Criterion {
  name: string;
  description: string;
  max_score: number;
  weight: number;
}

// ===== Assessment Types =====
export interface Assessment {
  id: string;
  attempt_id: string;
  score: number | null;
  confidence: number | null;
  reasoning_summary: string;
  criteria: CriterionScore[];
  error?: string;
  error_code?: string;
  retrieved_chunks?: Chunk[];
}

export interface CriterionScore {
  name: string;
  score: number | null;
  comment: string;
}

export interface Chunk {
  id: string;
  content: string;
  page?: number;
  source_document_id: string;
}

// ===== Evidence Types =====
export interface Evidence {
  id: string;
  attempt_id: string;
  kind: 'AUDIO' | 'VIDEO';
  url: string;
  size: number;
  created_at: number;
}

// ===== API Response Types =====
export interface ApiResponse<T> {
  data: T;
  error?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  page_size: number;
}
```

### 5.3 API Client

```typescript
// packages/shared/src/api-client/client.ts
export class ApiClient {
  private baseUrl: string;
  private token?: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  setToken(token: string) {
    this.token = token;
  }

  clearToken() {
    this.token = undefined;
  }

  private async request<T>(
    method: string,
    path: string,
    options?: RequestInit
  ): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options?.headers as Record<string, string>),
    };

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    const response = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers,
      ...options,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
      throw new ApiError(response.status, error.detail || 'Request failed');
    }

    return response.json();
  }

  async get<T>(path: string): Promise<T> {
    return this.request<T>('GET', path);
  }

  async post<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>('POST', path, {
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  async put<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>('PUT', path, {
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  async delete<T>(path: string): Promise<T> {
    return this.request<T>('DELETE', path);
  }

  async upload(
    path: string,
    file: Blob,
    onProgress?: (progress: number) => void
  ): Promise<unknown> {
    const formData = new FormData();
    formData.append('file', file);

    const xhr = new XMLHttpRequest();

    return new Promise((resolve, reject) => {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable && onProgress) {
          onProgress((e.loaded / e.total) * 100);
        }
      };

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(JSON.parse(xhr.responseText));
        } else {
          reject(new ApiError(xhr.status, 'Upload failed'));
        }
      };

      xhr.onerror = () => reject(new ApiError(0, 'Network error'));

      xhr.open('POST', `${this.baseUrl}${path}`);
      if (this.token) {
        xhr.setRequestHeader('Authorization', `Bearer ${this.token}`);
      }
      xhr.send(formData);
    });
  }
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public message: string
  ) {
    super(message);
    this.name = 'ApiError';
  }
}
```

---

## 6. Backend API Specification

### 6.1 CORS Configuration

```python
# backend/app/main.py
from fastapi.middleware.cors import CORSMiddleware

ALLOWED_ORIGINS = [
    "http://localhost:3000",           # Staff Portal (dev)
    "http://localhost:5173",           # Student App (dev)
    "https://portal.oralai.edu.vn",   # Staff Portal (prod)
    # Add production origins as needed
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

### 6.2 Student-Specific Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/exams/available` | Get assigned exams for current student |
| GET | `/api/exam-sessions/{id}` | Get exam session details |
| POST | `/api/exam-sessions` | Start new exam session |
| POST | `/api/exam-sessions/{id}/start` | Start exam (device check done) |
| POST | `/api/exam-sessions/{id}/finish` | Submit all answers |
| GET | `/api/student/results` | Get student's all results |
| GET | `/api/student/results/{session_id}` | Get specific result |

### 6.3 Staff-Specific Endpoints

| Method | Endpoint | Role | Description |
|--------|----------|------|-------------|
| GET | `/api/admin/users` | ADMIN | List all users |
| POST | `/api/admin/users` | ADMIN | Create user |
| PUT | `/api/admin/users/{id}/role` | ADMIN | Update user role |
| GET | `/api/admin/courses` | TEACHER+ | List courses |
| POST | `/api/admin/courses` | TEACHER+ | Create course |
| GET | `/api/admin/courses/{id}/workspace` | TEACHER+ | Course workspace |
| POST | `/api/admin/exams` | EXAMINER+ | Create exam |
| POST | `/api/admin/exams/{id}/publish` | EXAMINER+ | Publish exam |
| POST | `/api/admin/exams/{id}/assign` | EXAMINER+ | Assign to students |
| GET | `/api/admin/results` | EXAMINER+ | List all results |
| PUT | `/api/admin/results/{id}/finalize` | EXAMINER | Finalize score |
| POST | `/api/admin/grading/{attempt_id}` | TEACHER+ | Submit grading |

---

## 7. Deployment Strategy

### 7.1 Environment Matrix

| Environment | Staff Portal | Student App | Backend API |
|-------------|--------------|-------------|-------------|
| Development | `localhost:3000` | `localhost:5173` | `localhost:8000` |
| Staging | `staging.oralai.edu.vn` | Download link | `api-staging.oralai.edu.vn` |
| Production | `portal.oralai.edu.vn` | Download link | `api.oralai.edu.vn` |

### 7.2 Staff Portal Deployment (Vercel)

```bash
# Connect repo to Vercel
vercel --prod

# Or via GitHub integration
# Set environment variables in Vercel dashboard:
# NEXT_PUBLIC_API_URL=https://api.oralai.edu.vn
```

### 7.3 Student App Distribution

```bash
# Build command
npm run build && npm run electron:build

# Output
# dist-electron/
# ├── OralAI-Student-1.0.0-Setup.exe
# └── OralAI-Student-1.0.0.dmg

# Upload to GitHub Releases
gh release create v1.0.0 --title "v1.0.0" --notes "Release notes"
gh release upload v1.0.0 dist-electron/*.exe

# Alternative: Upload to S3
aws s3 cp dist-electron/*.exe s3://oralai-releases/student-app/
```

### 7.4 Update Notification Flow

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Admin     │────▶│   GitHub    │────▶│   Student   │
│  releases   │     │  Releases   │     │  downloads  │
│   new .exe  │     │   stores    │     │   new .exe  │
└─────────────┘     └─────────────┘     └─────────────┘
                                                  │
                            ┌─────────────────────┘
                            │
                     Share link via:
                     - Email
                     - Staff Portal
                     - USB/Network drive
```

---

## 8. Migration Plan

### Phase 1: Extract Shared Package (Week 1)
1. Create `packages/shared`
2. Extract TypeScript types from backend
3. Create API client
4. Publish to local npm registry
5. Update imports in `admin-web`

### Phase 2: Create Student App (Week 2-3)
1. Setup Vite + React project
2. Install shared package
3. Implement Login page
4. Implement Exam List page
5. Migrate student components from admin-web
6. Implement Electron integration
7. Build and test

### Phase 3: Refactor Staff Portal (Week 4)
1. Rename `admin-web` → `staff-portal`
2. Install shared package
3. Implement RBAC middleware
4. Organize routes by role
5. Update sidebar dynamically
6. Deploy and test

### Phase 4: Deprecate Legacy (Week 5+)
1. Keep `desktop` app running for comparison
2. Migrate remaining features
3. Document migration steps
4. Deprecate and archive

---

## 9. Testing Strategy

### 9.1 Student App Tests

```typescript
// tests/e2e/student-app.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Student App', () => {
  test('login with MSSV and password', async ({ page }) => {
    await page.goto('/');
    await page.getByLabel('Mã sinh viên').fill('B1234567');
    await page.getByLabel('Mật khẩu').fill('password123');
    await page.click('button:has-text("Đăng nhập")');
    await expect(page).toHaveURL('/exams');
  });

  test('complete exam flow', async ({ page }) => {
    // Login
    // Select exam
    // Device check
    // Answer questions
    // Submit
    // Verify results
  });

  test('logout clears session', async ({ page }) => {
    // Login
    // Logout
    // Reload app
    // Should require login
  });
});
```

### 9.2 Staff Portal Tests

```typescript
// tests/e2e/staff-portal.spec.ts
test.describe('RBAC', () => {
  test('admin sees all menu items', async ({ page }) => {
    await loginAs(page, 'admin');
    await expect(page.locator('text=Người dùng')).toBeVisible();
    await expect(page.locator('text=Cấu hình')).toBeVisible();
  });

  test('teacher cannot access admin routes', async ({ page }) => {
    await loginAs(page, 'teacher');
    await page.goto('/admin/users');
    await expect(page).toHaveURL('/unauthorized');
  });
});
```

---

## 10. Security Considerations

### 10.1 Student App Security

| Concern | Mitigation |
|---------|------------|
| Token theft | JWT short expiry (1 hour), no refresh token stored |
| Exam cheating | Camera recording, device fingerprinting |
| Replay attacks | Idempotency keys on submissions |
| Man-in-middle | Certificate pinning (future) |

### 10.2 Staff Portal Security

| Concern | Mitigation |
|---------|------------|
| RBAC bypass | Server-side permission checks, not just UI hiding |
| Session hijacking | Secure HTTP-only cookies |
| CSRF | CSRF tokens on state-changing requests |
| XSS | Content Security Policy, sanitized inputs |

---

## 11. Glossary

| Term | Definition |
|------|------------|
| RBAC | Role-Based Access Control |
| STT | Speech-to-Text |
| PhoWhisper | Local STT engine (Whisper variant) |
| RAG | Retrieval-Augmented Generation |
| LO | Learning Outcome |
| RBAC | Role-Based Access Control |
| VLAN | Virtual Local Area Network |
| CID | Course ID |
| E2E | End-to-End (testing) |

---

## 12. Appendix

### A. Existing Components to Migrate

| Source | Destination | Notes |
|--------|------------|-------|
| `admin-web/components/student.tsx` | `student-app/pages/ExamRoom.tsx` | Major rewrite for standalone |
| `admin-web/components/shared.tsx` | `packages/shared/` | Extract shared components |
| `admin-web/components/api.ts` | `packages/shared/src/api-client/` | Already partially done |
| `desktop/transcribe.py` | `student-app/electron/stt.ts` | Keep Python, wrap with IPC |
| `admin-web/lib/noise-filter.ts` | `student-app/lib/` | Keep as-is |
| `admin-web/lib/microphone-gain.ts` | `student-app/hooks/` | Keep as-is |

### B. New Dependencies

```json
{
  "student-app": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "react-router-dom": "^6.x",
    "zustand": "^4.x",
    "electron": "^28.0.0",
    "electron-builder": "^24.0.0"
  },
  "packages/shared": {
    "typescript": "^5.0.0"
  }
}
```

### C. Milestones

| Milestone | Description | Target |
|-----------|-------------|--------|
| M1 | Shared package created | Week 1 |
| M2 | Student app login + exam list | Week 2 |
| M3 | Student app exam flow + STT | Week 3 |
| M4 | Student app packaged + tested | Week 4 |
| M5 | Staff portal RBAC implemented | Week 4 |
| M6 | Full integration testing | Week 5 |
| M7 | Production deployment | Week 6 |
