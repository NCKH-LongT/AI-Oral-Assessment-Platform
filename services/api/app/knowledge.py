"""Course-scoped mappings and immutable RAG scopes for published exams."""

from sqlalchemy import and_, delete, or_, select

from .models import (
    BookSection,
    Chunk,
    Document,
    LearningOutcome,
    TopicDocument,
    TopicOutcome,
    TopicSection,
)
from .security import by_id, fail


def topic_data(db, topic):
    outcomes = list(db.scalars(select(TopicOutcome.outcome_id).where(TopicOutcome.topic_id == topic.id)))
    return {
        "id": topic.id,
        "name": topic.name,
        "description": topic.description,
        "learning_outcome_id": topic.learning_outcome_id,
        "learning_outcome_ids": outcomes or [topic.learning_outcome_id],
        "chapter_ids": list(
            db.scalars(select(TopicSection.section_id).where(TopicSection.topic_id == topic.id))
        ),
        "document_ids": list(
            db.scalars(select(TopicDocument.document_id).where(TopicDocument.topic_id == topic.id))
        ),
    }


def validate_mappings(db, course_id, body):
    for model, ids in [
        (LearningOutcome, body.learning_outcome_ids),
        (BookSection, body.chapter_ids),
        (Document, body.document_ids),
    ]:
        for key in set(ids):
            row = by_id(db, model, key)
            if row.course_id != course_id:
                fail(422, "CROSS_COURSE", "LO, chương và tài liệu phải thuộc cùng môn học")
            if model is Document and row.kind == "TEXTBOOK":
                fail(422, "SELECT_CHAPTER", "Gắn giáo trình qua chương/mục, không gắn toàn bộ PDF")


def set_mappings(db, topic, body):
    with db.no_autoflush:
        validate_mappings(db, topic.course_id, body)
    topic.learning_outcome_id = body.learning_outcome_ids[0]
    topic.name, topic.description = body.name, body.description
    db.flush()
    for model, field, ids in [
        (TopicOutcome, "outcome_id", body.learning_outcome_ids),
        (TopicSection, "section_id", body.chapter_ids),
        (TopicDocument, "document_id", body.document_ids),
    ]:
        db.execute(delete(model).where(model.topic_id == topic.id))
        db.add_all(model(topic_id=topic.id, **{field: key}) for key in set(ids))
    db.flush()


def scope_query(db, course_id, topic_id):
    documents = select(TopicDocument.document_id).where(TopicDocument.topic_id == topic_id)
    sections = db.scalars(
        select(BookSection).join(TopicSection).where(TopicSection.topic_id == topic_id)
    ).all()
    conditions = [Chunk.document_id.in_(documents)]
    conditions.extend(
        and_(Chunk.document_id == s.document_id, Chunk.page.between(s.start_page, s.end_page))
        for s in sections
    )
    return select(Chunk).join(Document).where(Chunk.course_id == course_id, or_(*conditions))


def chunk_scope(db, course_id, topic_id, embedding_model):
    return list(
        db.scalars(
            scope_query(db, course_id, topic_id)
            .with_only_columns(Chunk.id)
            .where(
                Document.status == "READY",
                Document.embedding_model == embedding_model,
            )
        )
    )
