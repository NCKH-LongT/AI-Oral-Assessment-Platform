"""Built-in practice course, seeded idempotently without AI keys or external calls."""

from sqlalchemy import select

from .models import Course, Exam, LearningOutcome, Rubric, Topic, TopicOutcome, User

COURSE_ID = "00000000-0000-4000-8000-000000000001"
EXAM_ID = "00000000-0000-4000-8000-000000000002"


def ensure_practice(db):
    if db.get(Course, COURSE_ID):
        return
    owner = db.scalar(select(User).where(User.role == "ADMIN").order_by(User.created_at))
    if not owner:
        return
    course = Course(
        id=COURSE_ID,
        code="ORAL-PRACTICE",
        name="Luyện tập vấn đáp",
        description="Môn mặc định dành cho mọi tài khoản: thử camera, mic, trả lời và nộp bài. Không tính điểm chính thức.",
        owner_id=owner.id,
    )
    db.add(course)
    db.flush()
    lo = LearningOutcome(
        course_id=course.id, code="PRACTICE", description="Làm quen quy trình trả lời vấn đáp"
    )
    db.add(lo)
    db.flush()
    topic = Topic(
        course_id=course.id,
        learning_outcome_id=lo.id,
        name="Kỹ năng trình bày",
        description="Trình bày rõ ràng, có ví dụ",
    )
    db.add(topic)
    db.flush()
    db.add(TopicOutcome(topic_id=topic.id, outcome_id=lo.id))
    criteria = [
        {"name": "Trình bày", "description": "Trình bày rõ ý và có ví dụ", "max_score": 10, "weight": 1}
    ]
    rubric = Rubric(course_id=course.id, name="Rubric luyện tập", criteria=criteria)
    db.add(rubric)
    db.flush()
    questions = [
        {
            "text": text,
            "topic_id": topic.id,
            "difficulty": "EASY",
            "expected_concepts": ["Trình bày rõ ràng"],
            "reference_chunk_ids": [],
        }
        for text in (
            "Hãy giới thiệu ngắn gọn bản thân và một mục tiêu học tập của bạn.",
            "Hãy kể một ví dụ về cách bạn giải quyết khó khăn trong học tập và điều bạn rút ra.",
        )
    ]
    db.add(
        Exam(
            id=EXAM_ID,
            course_id=course.id,
            rubric_id=rubric.id,
            name="Thi thử: Làm quen hệ thống",
            time_limit=600,
            blueprint=[{"topic_id": topic.id, "difficulty": "EASY", "count": 2}],
            status="PUBLISHED",
            snapshot={
                "practice": True,
                "questions": questions,
                "criteria": criteria,
                "rubric_version": 1,
                "knowledge_version": "practice-v1",
                "ai_provider": "demo",
                "embedding_model": "demo-hash-768-v1",
                "llm_model": "practice",
                "prompt_version": "practice-v1",
                "document_ids": [],
                "topic_chunk_ids": {},
            },
        )
    )
    db.commit()
