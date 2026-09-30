# Backend Conventions

## 1. Giới thiệu

Tài liệu này quy định các convention cho backend code trong dự án AI Oral Assessment Platform, bao gồm `services/api` (FastAPI + Python).

---

## 2. Cấu hình hiện có

### 2.1 pyproject.toml

```toml
[project]
name = "oral-assessment-api"
version = "0.1.0"
requires-python = ">=3.12"

[tool.ruff]
line-length = 110

[tool.ruff.lint]
select = ["E", "F", "I"]
ignore = ["E501"]

[tool.pytest.ini_options]
pythonpath = ["."]
testpaths = ["tests"]
```

### 2.2 Dependencies

```toml
dependencies = [
  "fastapi>=0.115,<1",
  "uvicorn[standard]>=0.34,<1",
  "sqlalchemy>=2.0,<3",
  "alembic>=1.15,<2",
  "psycopg[binary]>=3.2,<4",
  "pgvector>=0.4,<1",
  "pydantic>=2.0,<3",
  "pydantic-settings>=2.8,<3",
  "PyJWT>=2.10,<3",
  "argon2-cffi>=23.1,<26",
]
```

---

## 3. Python Style Guide

### 3.1 PEP 8

Tuân thủ PEP 8 với các exceptions sau:

| Rule | Setting |
|------|---------|
| **Line length** | 110 characters (via Ruff) |
| **Import order** | stdlib → third-party → local |
| **Docstrings** | Google style |

### 3.2 Import Organization

```python
# 1. Standard library
import time
import uuid
from typing import Optional
from datetime import datetime

# 2. Third-party packages
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import String, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column
from pydantic import BaseModel, Field

# 3. Local application
from .db import Base
from .models import User, Exam
from .schemas import UserCreate
```

### 3.3 Type Hints

```python
# ✅ Required type hints
def get_user(user_id: str) -> User:
    ...

def create_exam(exam_data: ExamCreate, current_user: User = Depends(get_current_user)) -> Exam:
    ...

# ✅ Optional types
def find_user(name: Optional[str] = None) -> list[User]:
    ...

# ✅ Union types
from typing import Union
def process_data(data: Union[str, bytes]) -> dict:
    ...

# ❌ No type hints
def get_user(user_id):
    ...
```

---

## 4. FastAPI Conventions

### 4.1 Router Organization

```python
# routers/exams.py
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import Annotated

from ..database import get_db
from ..schemas import ExamCreate, ExamResponse
from ..models import Exam, User
from ..auth import get_current_user

router = APIRouter(prefix="/exams", tags=["exams"])


@router.get("", response_model=list[ExamResponse])
def list_exams(
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
    skip: int = 0,
    limit: int = 100,
) -> list[Exam]:
    """List all exams."""
    exams = db.query(Exam).offset(skip).limit(limit).all()
    return exams


@router.post("", response_model=ExamResponse, status_code=status.HTTP_201_CREATED)
def create_exam(
    exam_data: ExamCreate,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> Exam:
    """Create a new exam."""
    exam = Exam(**exam_data.model_dump())
    db.add(exam)
    db.commit()
    db.refresh(exam)
    return exam
```

### 4.2 Dependency Injection

```python
# dependencies/auth.py
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

security = HTTPBearer()


async def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials, Depends(security)],
    db: Session = Depends(get_db),
) -> User:
    """Validate JWT token and return current user."""
    token = credentials.credentials

    try:
        payload = decode_token(token)
        user_id = payload.get("sub")
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token",
        )

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
        )

    return user


def require_admin(user: User = Depends(get_current_user)) -> User:
    """Require admin role."""
    if user.role != "ADMIN":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )
    return user
```

---

## 5. Pydantic Schemas

### 5.1 Schema Structure

```python
# schemas/exam.py
from pydantic import BaseModel, Field, ConfigDict
from typing import Optional
from datetime import datetime


class ExamBase(BaseModel):
    """Base exam schema."""

    name: str = Field(..., min_length=1, max_length=200)
    time_limit: int = Field(..., ge=1, le=480, description="Time limit in minutes")


class ExamCreate(ExamBase):
    """Schema for creating an exam."""

    course_id: str
    rubric_id: str
    blueprint: list[dict]


class ExamUpdate(BaseModel):
    """Schema for updating an exam."""

    name: Optional[str] = Field(None, min_length=1, max_length=200)
    time_limit: Optional[int] = Field(None, ge=1, le=480)


class ExamResponse(ExamBase):
    """Schema for exam response."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    course_id: str
    rubric_id: str
    status: str
    created_at: datetime
```

### 5.2 Validation

```python
from pydantic import validator, field_validator


class QuestionCreate(BaseModel):
    """Schema for creating a question."""

    content: str = Field(..., min_length=10)
    difficulty: str = Field(...)

    @field_validator("difficulty")
    @classmethod
    def validate_difficulty(cls, v: str) -> str:
        allowed = {"easy", "medium", "hard"}
        if v.lower() not in allowed:
            raise ValueError(f"difficulty must be one of {allowed}")
        return v.lower()
```

---

## 6. Database Models (SQLAlchemy)

### 6.1 Model Structure

```python
# models/exam.py
import time
import uuid
from sqlalchemy import String, ForeignKey, Integer, Float
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base


def uid() -> str:
    """Generate unique ID."""
    return str(uuid.uuid4())


class Exam(Base):
    """Exam model."""

    __tablename__ = "exams"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    course_id: Mapped[str] = mapped_column(String(36), ForeignKey("courses.id"))
    rubric_id: Mapped[str] = mapped_column(String(36), ForeignKey("rubrics.id"))
    name: Mapped[str] = mapped_column(String(200))
    time_limit: Mapped[int] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String(20), default="DRAFT")
    created_at: Mapped[float] = mapped_column(Float, default=time.time)

    # Relationships
    course: Mapped["Course"] = relationship("Course", back_populates="exams")
    rubric: Mapped["Rubric"] = relationship("Rubric")
```

### 6.2 Async vs Sync

```python
# Database setup
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

# Sync engine (current)
engine = create_engine(DATABASE_URL, echo=False)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# For new code, prefer async when possible:
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession

async_engine = create_async_engine(DATABASE_URL.replace("postgresql://", "postgresql+asyncpg://"))
AsyncSessionLocal = sessionmaker(async_engine, class_=AsyncSession, expire_on_commit=False)
```

---

## 7. Error Handling

### 7.1 Custom Exceptions

```python
# exceptions.py
class AppException(Exception):
    """Base application exception."""

    def __init__(self, code: str, message: str, status_code: int = 400):
        self.code = code
        self.message = message
        self.status_code = status_code
        super().__init__(message)


class NotFoundException(AppException):
    """Resource not found."""

    def __init__(self, resource: str, resource_id: str):
        super().__init__(
            code=f"{resource.upper()}_NOT_FOUND",
            message=f"{resource} with id '{resource_id}' not found",
            status_code=404,
        )


class UnauthorizedException(AppException):
    """Unauthorized access."""

    def __init__(self, message: str = "Unauthorized"):
        super().__init__(
            code="UNAUTHORIZED",
            message=message,
            status_code=401,
        )


class ForbiddenException(AppException):
    """Forbidden access."""

    def __init__(self, message: str = "Access denied"):
        super().__init__(
            code="FORBIDDEN",
            message=message,
            status_code=403,
        )
```

### 7.2 Error Response Format

```python
# exception_handlers.py
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError


async def app_exception_handler(request: Request, exc: AppException) -> JSONResponse:
    """Handle application exceptions."""
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error": {
                "code": exc.code,
                "message": exc.message,
            }
        },
    )


async def validation_exception_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
    """Handle validation errors."""
    return JSONResponse(
        status_code=422,
        content={
            "error": {
                "code": "VALIDATION_ERROR",
                "message": "Request validation failed",
                "details": exc.errors(),
            }
        },
    )
```

---

## 8. Logging

### 8.1 Structured Logging

```python
import logging
from typing import Any

# Configure logger
logger = logging.getLogger(__name__)


def log_event(
    event: str,
    user_id: str | None = None,
    exam_id: str | None = None,
    **kwargs: Any,
) -> None:
    """Log structured event."""
    context = {
        "event": event,
        "user_id": user_id,
        "exam_id": exam_id,
        **kwargs,
    }
    logger.info(context)


# Usage
@router.post("/exams/{exam_id}/submit")
def submit_exam(
    exam_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    log_event(
        "exam_submitted",
        user_id=current_user.id,
        exam_id=exam_id,
    )
```

### 8.2 Sensitive Data

```python
# ❌ Never log sensitive data
logger.info(f"User {user_id} logged in with password: {password}")

# ✅ Log without sensitive data
logger.info(f"User {user_id} login attempt", extra={"ip": ip_address})

# ✅ Use redaction for sensitive fields
def redact_sensitive(data: dict, fields: list[str]) -> dict:
    """Redact sensitive fields for logging."""
    redacted = data.copy()
    for field in fields:
        if field in redacted:
            redacted[field] = "[REDACTED]"
    return redacted
```

---

## 9. Testing Conventions

### 9.1 Test Structure

```python
# tests/test_exams.py
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.main import app
from app.database import Base, get_db
from app.models import User, Exam
from app.auth import create_access_token


# Test database
SQLALCHEMY_DATABASE_URL = "sqlite:///./test.db"
engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False})
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def override_get_db():
    """Override database dependency."""
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


@pytest.fixture(scope="function")
def db():
    """Create test database."""
    Base.metadata.create_all(bind=engine)
    yield TestingSessionLocal()
    Base.metadata.drop_all(bind=engine)


@pytest.fixture(scope="function")
def client(db):
    """Create test client."""
    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


@pytest.fixture
def admin_user(db: Session):
    """Create admin user."""
    user = User(
        username="admin",
        name="Admin User",
        role="ADMIN",
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@pytest.fixture
def admin_token(admin_user: User) -> str:
    """Create admin token."""
    return create_access_token({"sub": admin_user.id})


class TestExamEndpoints:
    """Test exam endpoints."""

    def test_create_exam(self, client: TestClient, admin_token: str):
        """Test creating an exam."""
        response = client.post(
            "/exams",
            json={"name": "Test Exam", "time_limit": 60},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert response.status_code == 201
        data = response.json()
        assert data["name"] == "Test Exam"
        assert data["status"] == "DRAFT"

    def test_create_exam_requires_auth(self, client: TestClient):
        """Test creating exam requires authentication."""
        response = client.post(
            "/exams",
            json={"name": "Test Exam", "time_limit": 60},
        )
        assert response.status_code == 401
```

### 9.2 Test Naming

```python
# ✅ Descriptive test names
def test_create_exam_with_valid_data_returns_201():
    ...

def test_create_exam_without_auth_returns_401():
    ...

def test_create_exam_with_invalid_data_returns_422():
    ...

# ❌ Unclear test names
def test_exam():
    ...

def test_create():
    ...
```

---

## 10. Best Practices Checklist

- [ ] Sử dụng type hints cho tất cả functions
- [ ] Tuân thủ import order (stdlib → third-party → local)
- [ ] Viết docstrings Google style
- [ ] Dùng Pydantic cho input/output validation
- [ ] Dùng dependency injection của FastAPI
- [ ] Xử lý exceptions với custom exception classes
- [ ] Log không có sensitive data
- [ ] Viết tests cho business logic
- [ ] Chạy `ruff` trước khi commit
