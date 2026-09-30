# Contributing Guidelines

## 1. Giới thiệu

Tài liệu này quy định quy trình đóng góp cho dự án AI Oral Assessment Platform.

---

## 2. Branch Strategy

### 2.1 Branch Types

```
main                    # Production-ready code
├── develop             # Integration branch (optional)
├── feature/xxx        # Feature development
├── fix/xxx            # Bug fixes
├── refactor/xxx       # Code refactoring
├── docs/xxx           # Documentation
└── chore/xxx         # Maintenance tasks
```

### 2.2 Branch Naming

```bash
# Feature branches
git checkout -b feat/add-rubric-management
git checkout -b feat/english-terms-suggestion

# Bug fix branches
git checkout -b fix/stt-timeout-error
git checkout -b fix/upload-retry-issue

# Refactoring branches
git checkout -b refactor/extract-user-repository

# Documentation branches
git checkout -b docs/update-user-guide

# Chore branches
git checkout -b chore/upgrade-dependencies
```

### 2.3 Branch Lifecycle

1. **Create** from `main`
2. **Develop** with frequent commits
3. **Review** via Pull Request
4. **Merge** to `main` after approval
5. **Delete** branch after merge

---

## 3. Commit Guidelines

### 3.1 Commit Message Format

```
<type>(<scope>): <description>

[optional body]

[optional footer]
```

### 3.2 Commit Types

| Type | Description | Example |
|------|-------------|---------|
| `feat` | New feature | `feat(exam): add rubric selection` |
| `fix` | Bug fix | `fix(stt): handle timeout error` |
| `docs` | Documentation | `docs(api): update endpoint docs` |
| `style` | Formatting | `style: run prettier` |
| `refactor` | Code refactoring | `refactor(grading): extract logic` |
| `test` | Tests | `test(exam): add integration tests` |
| `chore` | Maintenance | `chore: upgrade dependencies` |
| `perf` | Performance | `perf(upload): optimize chunking` |

### 3.3 Examples

```bash
# Good commits
git commit -m "feat(exam): add rubric management for teachers"
git commit -m "fix(stt): handle timeout during audio transcription"
git commit -m "docs(user-guide): update exam creation walkthrough"
git commit -m "refactor(grading): extract RAG retrieval logic"
git commit -m "test(api): add tests for exam endpoints"

# Commit with body
git commit -m "feat(upload): add resumable chunk upload
- Implement chunked upload with SHA256 verification
- Add retry logic for failed chunks
- Store upload progress in database"

# ❌ Avoid
git commit -m "fix bug"
git commit -m "update"
git commit -m "WIP"
git commit -m "asdf"
```

### 3.4 Commit Frequency

- Commit **thường xuyên** khi hoàn thành một phần nhỏ
- Mỗi commit nên **có ý nghĩa** và có thể build được
- Tránh commit quá lớn (>500 dòng thay đổi)

---

## 4. Pull Request Process

### 4.1 Before Creating PR

```bash
# 1. Sync with latest main
git fetch origin
git checkout main
git pull origin main

# 2. Create feature branch
git checkout -b feat/your-feature

# 3. Make changes and commit
# ... make changes ...
git add .
git commit -m "feat(scope): description"

# 4. Rebase on latest main (if needed)
git fetch origin
git rebase origin/main

# 5. Run tests locally
npm run lint
npm run typecheck
npm run test

# hoặc với Python
cd services/api
ruff check .
pytest tests/
```

### 4.2 Pull Request Template

```markdown
## Description
Mô tả ngắn gọn thay đổi.

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation update

## How Has This Been Tested?
Mô tả cách test (unit test, integration test, manual test).

## Checklist
- [ ] Code follows project conventions
- [ ] Tests added/updated
- [ ] Documentation updated
- [ ] No console errors/warnings
```

### 4.3 PR Requirements

| Requirement | Description |
|-------------|-------------|
| **Title** | Clear, descriptive title theo conventional commits |
| **Description** | Mô tả what/why/how |
| **Linked Issues** | Link related issues (#123) |
| **Screenshots** | UI changes cần có screenshots |
| **Tests** | Tests cho new functionality |
| **Linting** | Pass lint và typecheck |

### 4.4 Review Process

```
PR Created
    ↓
CI Checks (Lint, Test, Build)
    ↓
Code Review (1 approval required)
    ↓
Changes Requested?
    ↓ Yes → Developer addresses feedback
    ↓ No → Approve & Merge
    ↓
Branch Deleted
```

### 4.5 Merge Strategy

```bash
# ✅ Squash and merge (recommended for feature branches)
# Rebase và squash thành một commit

# ✅ Merge (nếu muốn giữ lịch sử commits)
git checkout main
git merge --no-ff feature/xxx
```

---

## 5. Code Review Guidelines

### 5.1 For Reviewers

- Review **trong vòng 24 giờ**
- Be **constructive** và respectful
- Focus on **correctness**, **readability**, và **performance**
- Đề xuất **improvements** không chỉ críticas
- Approve khi hài lòng với code

### 5.2 For Authors

- Respond to feedback **promptly**
- Chỉ resolve conversations khi đã addressed
- Ask for clarification nếu không hiểu feedback
- Don't take feedback personally

### 5.3 Review Checklist

```markdown
### Correctness
- [ ] Code hoạt động đúng như intended?
- [ ] Edge cases được xử lý?
- [ ] Error handling đầy đủ?

### Security
- [ ] No sensitive data exposed?
- [ ] Input validation đầy đủ?
- [ ] Authentication/Authorization đúng?

### Performance
- [ ] No N+1 queries?
- [ ] Appropriate caching?
- [ ] No memory leaks?

### Code Quality
- [ ] Follows naming conventions?
- [ ] Well-documented (if needed)?
- [ ] Tests adequate?
```

---

## 6. Development Workflow

### 6.1 Local Setup

```bash
# 1. Clone repository
git clone https://github.com/your-org/AI-Oral-Assessment-Platform.git
cd AI-Oral-Assessment-Platform

# 2. Install dependencies
npm install

# 3. Copy environment file
cp .env.example .env
# Edit .env with your configuration

# 4. Start services
docker compose up -d --build

# 5. Run migrations
docker compose run --rm migrate

# 6. Start development
npm run dev
```

### 6.2 Running Tests

```bash
# Frontend
cd apps/admin-web
npm run lint
npm run typecheck
npm run test

# Backend
cd services/api
ruff check .
pytest tests/ -v

# E2E (nếu có)
npm run test:e2e
```

### 6.3 Building

```bash
# Frontend
npm run build

# Backend
docker build -t oral-assessment-api services/api

# Desktop (Windows/Linux/macOS)
npm run build:desktop
```

---

## 7. CI/CD Pipeline

### 7.1 Jenkins Pipeline Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    JENKINS PIPELINE                         │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────┐    ┌──────────┐    ┌──────────────────┐   │
│  │ Checkout  │───▶│ Preflight │───▶│   Build API      │   │
│  └──────────┘    └──────────┘    └────────┬─────────┘   │
│                                            │              │
│                                            ▼              │
│  ┌──────────────────────────────────────────────────────┐ │
│  │              Test API (Isolated SQLite)              │ │
│  └──────────────────────────────────────────────────────┘ │
│                                            │              │
│                                            ▼              │
│  ┌──────────────────────────────────────────────────────┐ │
│  │     Build & Check Web (Lint + Typecheck + Build)    │ │
│  └──────────────────────────────────────────────────────┘ │
│                                            │              │
│                                            ▼              │
│  ┌──────────────────────────────────────────────────────┐ │
│  │                   Deploy Oral Web                     │ │
│  └──────────────────────────────────────────────────────┘ │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 7.2 Pipeline Stages

| Stage | Description | Failure Action |
|-------|-------------|----------------|
| **Checkout** | Clone repository | Stop |
| **Preflight** | Verify prerequisites (Python, Docker, etc.) | Stop |
| **Build API** | Build Docker image for API | Stop |
| **Test API** | Run pytest với isolated SQLite | Stop deployment |
| **Build Web** | Lint, typecheck, build Next.js | Stop deployment |
| **Deploy** | Deploy to server với validation | Manual recovery |

### 7.3 Environment Variables Required

```bash
# Deployment validation checks:
JWT_SECRET (≥32 chars)
BOOTSTRAP_PASSWORD (≥12 chars)
POSTGRES_PASSWORD (≥12 chars)
MINIO_ROOT_PASSWORD (≥8 chars)
PUBLIC_ORIGIN (must match expected)
ALLOWED_ORIGINS (must match expected)
COOKIE_SECURE (must be true)
AI_PROVIDER (demo/gemini/local)
GOOGLE_LOGIN_ENABLED (if using Google OAuth)
```

---

## 8. Issue Management

### 8.1 Issue Types

| Type | Label | Description |
|------|-------|-------------|
| Bug | `bug` | Something isn't working |
| Feature | `enhancement` | New feature request |
| Documentation | `documentation` | Improvements to docs |
| Performance | `performance` | Performance improvements |
| Security | `security` | Security issues |

### 8.2 Issue Template

```markdown
## Problem
Mô tả vấn đề.

## Steps to Reproduce
1. Go to '...'
2. Click on '...'
3. See error

## Expected Behavior
Mô tả expected behavior.

## Screenshots
Nếu có UI changes.

## Environment
- OS: [e.g. Windows 11]
- Browser: [e.g. Chrome]
- Version: [e.g. 1.0.0]

## Additional Context
Any other context about the problem.
```

---

## 9. Release Process

### 9.1 Versioning

Sử dụng [Semantic Versioning](https://semver.org/):

```
MAJOR.MINOR.PATCH
1.0.0
 │  │  └── Patch: Bug fixes
 │  └────── Minor: New features (backward compatible)
 └───────── Major: Breaking changes
```

### 9.2 Release Steps

```bash
# 1. Update version
# Edit pyproject.toml, package.json

# 2. Update changelog
git log --oneline v1.0.0..HEAD > CHANGELOG.md

# 3. Create release branch
git checkout -b release/v1.1.0

# 4. Tag
git tag -a v1.1.0 -m "Release version 1.1.0"

# 5. Merge to main
git checkout main
git merge release/v1.1.0

# 6. Push
git push origin main --tags
```

---

## 10. Quick Reference

### Common Commands

```bash
# Create feature branch
git checkout -b feat/your-feature

# Update branch with main
git fetch origin && git rebase origin/main

# Run frontend checks
cd apps/admin-web
npm run lint && npm run typecheck

# Run backend checks
cd services/api
ruff check . && pytest tests/

# Create PR
gh pr create --title "feat(scope): description" --body "..."

# Sync fork
git fetch upstream && git checkout main && git merge upstream/main
```

### Checklist Before PR

- [ ] Branch đúng format (`feat/`, `fix/`, etc.)
- [ ] Commits đúng conventional format
- [ ] Code passes lint và typecheck
- [ ] Tests pass
- [ ] PR description đầy đủ
- [ ] No console errors/warnings
- [ ] Sensitive data not committed
- [ ] Documentation updated (nếu cần)
