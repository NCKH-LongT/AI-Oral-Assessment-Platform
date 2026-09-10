import time
import uuid

from pgvector.sqlalchemy import Vector
from sqlalchemy import JSON, Float, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from .db import Base


def uid():
    return str(uuid.uuid4())


class Entity:
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    created_at: Mapped[float] = mapped_column(Float, default=time.time)


class User(Entity, Base):
    __tablename__ = "users"
    username: Mapped[str] = mapped_column(String(80), unique=True)
    name: Mapped[str] = mapped_column(String(150))
    password_hash: Mapped[str] = mapped_column(Text)
    role: Mapped[str] = mapped_column(String(20))
    status: Mapped[str] = mapped_column(String(20), default="ACTIVE")


class AuthSession(Entity, Base):
    __tablename__ = "auth_sessions"
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    expires_at: Mapped[float] = mapped_column(Float)
    revoked: Mapped[bool] = mapped_column(default=False)


class Course(Entity, Base):
    __tablename__ = "courses"
    code: Mapped[str] = mapped_column(String(50), unique=True)
    name: Mapped[str] = mapped_column(String(200))
    description: Mapped[str] = mapped_column(Text, default="")
    owner_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    status: Mapped[str] = mapped_column(String(20), default="ACTIVE")


class LearningOutcome(Entity, Base):
    __tablename__ = "learning_outcomes"
    __table_args__ = (UniqueConstraint("course_id", "code"),)
    course_id: Mapped[str] = mapped_column(ForeignKey("courses.id"))
    code: Mapped[str] = mapped_column(String(50))
    description: Mapped[str] = mapped_column(Text)
    weight: Mapped[float] = mapped_column(Float, default=1)


class Topic(Entity, Base):
    __tablename__ = "topics"
    course_id: Mapped[str] = mapped_column(ForeignKey("courses.id"))
    learning_outcome_id: Mapped[str] = mapped_column(ForeignKey("learning_outcomes.id"))
    name: Mapped[str] = mapped_column(String(200))
    description: Mapped[str] = mapped_column(Text, default="")


class Document(Entity, Base):
    __tablename__ = "documents"
    course_id: Mapped[str] = mapped_column(ForeignKey("courses.id"))
    topic_id: Mapped[str] = mapped_column(ForeignKey("topics.id"))
    filename: Mapped[str] = mapped_column(String(250))
    storage_key: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(20), default="PENDING")
    version: Mapped[int] = mapped_column(Integer, default=1)
    error: Mapped[str | None] = mapped_column(Text)
    embedding_model: Mapped[str] = mapped_column(String(150))


class Chunk(Entity, Base):
    __tablename__ = "document_chunks"
    document_id: Mapped[str] = mapped_column(ForeignKey("documents.id"), index=True)
    course_id: Mapped[str] = mapped_column(ForeignKey("courses.id"), index=True)
    topic_id: Mapped[str] = mapped_column(ForeignKey("topics.id"))
    learning_outcome_id: Mapped[str] = mapped_column(ForeignKey("learning_outcomes.id"))
    page: Mapped[int] = mapped_column(Integer)
    content: Mapped[str] = mapped_column(Text)
    embedding: Mapped[list] = mapped_column(JSON().with_variant(Vector(768), "postgresql"))


class Rubric(Entity, Base):
    __tablename__ = "rubrics"
    course_id: Mapped[str] = mapped_column(ForeignKey("courses.id"))
    name: Mapped[str] = mapped_column(String(200))
    version: Mapped[int] = mapped_column(Integer, default=1)
    criteria: Mapped[list] = mapped_column(JSON(none_as_null=True))


class Exam(Entity, Base):
    __tablename__ = "exams"
    course_id: Mapped[str] = mapped_column(ForeignKey("courses.id"))
    rubric_id: Mapped[str] = mapped_column(ForeignKey("rubrics.id"))
    name: Mapped[str] = mapped_column(String(200))
    time_limit: Mapped[int] = mapped_column(Integer)
    blueprint: Mapped[list] = mapped_column(JSON(none_as_null=True))
    status: Mapped[str] = mapped_column(String(20), default="DRAFT")
    snapshot: Mapped[dict | None] = mapped_column(JSON(none_as_null=True))


class Assignment(Entity, Base):
    __tablename__ = "assignments"
    __table_args__ = (UniqueConstraint("exam_id", "student_id"),)
    exam_id: Mapped[str] = mapped_column(ForeignKey("exams.id"))
    student_id: Mapped[str] = mapped_column(ForeignKey("users.id"))


class ExamSession(Entity, Base):
    __tablename__ = "exam_sessions"
    __table_args__ = (UniqueConstraint("exam_id", "student_id"),)
    exam_id: Mapped[str] = mapped_column(ForeignKey("exams.id"))
    student_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    status: Mapped[str] = mapped_column(String(30), default="DEVICE_CHECK")
    started_at: Mapped[float | None] = mapped_column(Float)
    completed_at: Mapped[float | None] = mapped_column(Float)
    final_score: Mapped[float | None] = mapped_column(Float)


class Attempt(Entity, Base):
    __tablename__ = "question_attempts"
    __table_args__ = (UniqueConstraint("session_id", "sequence"),)
    session_id: Mapped[str] = mapped_column(ForeignKey("exam_sessions.id"), index=True)
    sequence: Mapped[int] = mapped_column(Integer)
    question: Mapped[dict] = mapped_column(JSON(none_as_null=True))
    status: Mapped[str] = mapped_column(String(30), default="READY")
    started_at: Mapped[float | None] = mapped_column(Float)
    finished_at: Mapped[float | None] = mapped_column(Float)
    transcript: Mapped[str | None] = mapped_column(Text)
    stt_confidence: Mapped[float | None] = mapped_column(Float)
    assessment: Mapped[dict | None] = mapped_column(JSON(none_as_null=True))
    submit_key: Mapped[str | None] = mapped_column(String(100))


class Upload(Entity, Base):
    __tablename__ = "uploads"
    attempt_id: Mapped[str] = mapped_column(ForeignKey("question_attempts.id"))
    kind: Mapped[str] = mapped_column(String(10))
    mime_type: Mapped[str] = mapped_column(String(100))
    size: Mapped[int] = mapped_column(Integer)
    sha256: Mapped[str] = mapped_column(String(64))
    total_chunks: Mapped[int] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String(20), default="PENDING")
    storage_key: Mapped[str | None] = mapped_column(Text)


class Audit(Entity, Base):
    __tablename__ = "audit_logs"
    user_id: Mapped[str | None] = mapped_column(String(36))
    event: Mapped[str] = mapped_column(String(80))
    details: Mapped[dict] = mapped_column(JSON, default=dict)
