"""Textbook sections, many-to-many topic mappings and audited speech reviews."""

import sqlalchemy as sa

from alembic import op

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def entity():
    return [
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("created_at", sa.Float(), nullable=False),
    ]


def upgrade():
    with op.batch_alter_table("documents") as batch:
        batch.alter_column("topic_id", existing_type=sa.String(36), nullable=True)
        batch.add_column(sa.Column("kind", sa.String(20), nullable=False, server_default="SUPPLEMENT"))
        batch.add_column(sa.Column("page_count", sa.Integer(), nullable=True))
    with op.batch_alter_table("document_chunks") as batch:
        batch.alter_column("topic_id", existing_type=sa.String(36), nullable=True)
        batch.alter_column("learning_outcome_id", existing_type=sa.String(36), nullable=True)
        batch.add_column(sa.Column("heading", sa.Text(), nullable=True))
    op.create_index(
        "one_textbook_per_course",
        "documents",
        ["course_id"],
        unique=True,
        postgresql_where=sa.text("kind = 'TEXTBOOK'"),
        sqlite_where=sa.text("kind = 'TEXTBOOK'"),
    )
    op.create_table(
        "book_sections",
        *entity(),
        sa.Column("course_id", sa.String(36), sa.ForeignKey("courses.id"), nullable=False),
        sa.Column("document_id", sa.String(36), sa.ForeignKey("documents.id"), nullable=False),
        sa.Column("title", sa.String(300), nullable=False),
        sa.Column("level", sa.Integer(), nullable=False),
        sa.Column("start_page", sa.Integer(), nullable=False),
        sa.Column("end_page", sa.Integer(), nullable=False),
        sa.Column("source", sa.String(20), nullable=False),
    )
    for table, field, target in [
        ("topic_outcomes", "outcome_id", "learning_outcomes"),
        ("topic_sections", "section_id", "book_sections"),
        ("topic_documents", "document_id", "documents"),
    ]:
        op.create_table(
            table,
            sa.Column(
                "topic_id", sa.String(36), sa.ForeignKey("topics.id", ondelete="CASCADE"), primary_key=True
            ),
            sa.Column(field, sa.String(36), sa.ForeignKey(f"{target}.id"), primary_key=True),
        )
    op.execute("INSERT INTO topic_outcomes (topic_id, outcome_id) SELECT id, learning_outcome_id FROM topics")
    op.execute(
        "INSERT INTO topic_documents (topic_id, document_id) SELECT topic_id, id FROM documents WHERE topic_id IS NOT NULL"
    )
    op.create_table(
        "system_settings",
        sa.Column("key", sa.String(80), primary_key=True),
        sa.Column("value", sa.JSON(), nullable=False),
    )
    op.create_table(
        "review_jobs",
        *entity(),
        sa.Column("attempt_id", sa.String(36), sa.ForeignKey("question_attempts.id"), nullable=False),
        sa.Column("requested_by", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("reason", sa.Text(), nullable=False),
        sa.Column("policy", sa.JSON(), nullable=False),
        sa.Column("original", sa.JSON(), nullable=False),
        sa.Column("result", sa.JSON(), nullable=True),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("completed_at", sa.Float(), nullable=True),
    )
    op.create_index("ix_review_jobs_attempt_id", "review_jobs", ["attempt_id"])


def downgrade():
    raise RuntimeError("Migration bổ sung dữ liệu; khôi phục bản backup để quay về 0001.")
