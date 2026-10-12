"""Durable, observable server transcription and grading queue."""
import sqlalchemy as sa
from alembic import op

revision = "0008"
down_revision = "0007"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "answer_processing_jobs",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("created_at", sa.Float(), nullable=False),
        sa.Column("attempt_id", sa.String(36), sa.ForeignKey("question_attempts.id", ondelete="CASCADE"), nullable=False, unique=True),
        sa.Column("status", sa.String(30), nullable=False),
        sa.Column("policy", sa.JSON(), nullable=False),
        sa.Column("stage", sa.String(10), nullable=False),
        sa.Column("token", sa.String(36)),
        sa.Column("lease_until", sa.Float()),
        sa.Column("updated_at", sa.Float(), nullable=False),
        sa.Column("runs", sa.Integer(), nullable=False),
        sa.Column("error", sa.Text()),
        sa.Column("result", sa.JSON()),
    )
    op.create_index("ix_answer_processing_jobs_status", "answer_processing_jobs", ["status"])


def downgrade():
    op.drop_table("answer_processing_jobs")
