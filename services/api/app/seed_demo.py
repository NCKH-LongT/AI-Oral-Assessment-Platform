"""Explicit opt-in sample data. Never called automatically by Compose."""

import os
from pathlib import Path

from sqlalchemy import select

from . import ai, storage
from .db import SessionLocal
from .documents import process_document
from .models import Assignment, Course, Document, Exam, LearningOutcome, Rubric, Topic, User, uid
from .routes_admin import publish
from .security import hasher


def seed():
    if ai.settings().ai_provider != "demo":
        raise SystemExit("Seed demo chỉ chạy khi AI_PROVIDER=demo")
    password = os.environ.get("DEMO_PASSWORD", "")
    if len(password) < 12:
        raise SystemExit("Đặt DEMO_PASSWORD tối thiểu 12 ký tự")
    storage.initialize_storage()
    with SessionLocal() as db:
        if db.scalar(select(Course).where(Course.code == "SE101-DEMO")):
            print("Dữ liệu demo đã tồn tại; không thay đổi.")
            return

        def user(username, name, role):
            row = db.scalar(select(User).where(User.username == username))
            if not row:
                row = User(username=username, name=name, role=role, password_hash=hasher.hash(password))
                db.add(row)
                db.flush()
            return row

        teacher = user("teacher.demo", "Giảng viên Demo", "TEACHER")
        student = user("student.demo", "Sinh viên Demo", "STUDENT")
        course = Course(
            code="SE101-DEMO",
            name="Nhập môn Công nghệ phần mềm",
            description="Bộ dữ liệu mẫu: Dependency Injection",
            owner_id=teacher.id,
        )
        db.add(course)
        db.flush()
        lo = LearningOutcome(
            course_id=course.id, code="LO1", description="Giải thích DI và áp dụng trong kiểm thử", weight=1
        )
        db.add(lo)
        db.flush()
        topic = Topic(
            course_id=course.id,
            learning_outcome_id=lo.id,
            name="Dependency Injection",
            description="Khái niệm, lợi ích và ví dụ",
        )
        db.add(topic)
        db.flush()
        sample = Path(__file__).parent / "sample.txt"
        key = f"documents/{uid()}/se101.txt"
        storage.put(key, sample.read_bytes())
        document = Document(
            course_id=course.id,
            topic_id=topic.id,
            filename="se101.txt",
            storage_key=key,
            embedding_model=ai.embedding_name(),
        )
        db.add(document)
        db.flush()
        process_document(db, document)
        rubric = Rubric(
            course_id=course.id,
            name="Rubric vấn đáp cơ bản",
            criteria=[
                {
                    "name": "Kiến thức",
                    "description": "Đúng khái niệm theo tài liệu",
                    "max_score": 5,
                    "weight": 3,
                },
                {"name": "Giải thích", "description": "Có ví dụ rõ ràng", "max_score": 5, "weight": 2},
            ],
        )
        db.add(rubric)
        db.flush()
        exam = Exam(
            course_id=course.id,
            rubric_id=rubric.id,
            name="Vấn đáp: Dependency Injection",
            time_limit=900,
            blueprint=[{"topic_id": topic.id, "difficulty": "MEDIUM", "count": 2}],
        )
        db.add(exam)
        db.commit()
        publish(exam.id, db, teacher)
        db.add(Assignment(exam_id=exam.id, student_id=student.id))
        db.commit()
        print("Đã tạo teacher.demo, student.demo và bài thi SE101-DEMO. Mật khẩu lấy từ DEMO_PASSWORD.")


if __name__ == "__main__":
    seed()
