"""Reviewed examination workflow, roster schedules, manual grades and hotwords."""
import sqlalchemy as sa

from alembic import op

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("users", sa.Column("requested_role", sa.String(20), nullable=True))
    op.add_column("courses", sa.Column("hotwords", sa.JSON(), nullable=False, server_default="[]"))
    op.add_column("exams", sa.Column("workflow", sa.Boolean(), nullable=False, server_default=sa.false()))
    for name, kind in [("student_number", sa.String(80)), ("opens_at", sa.Float()), ("closes_at", sa.Float())]:
        op.add_column("assignments", sa.Column(name, kind, nullable=True))
    op.add_column("exam_sessions", sa.Column("ai_score", sa.Float(), nullable=True))
    op.add_column("exam_sessions", sa.Column("manual_review", sa.JSON(), nullable=True))


def downgrade():
    for table, fields in [
        ("exam_sessions", ["manual_review", "ai_score"]),
        ("assignments", ["closes_at", "opens_at", "student_number"]),
        ("exams", ["workflow"]), ("courses", ["hotwords"]), ("users", ["requested_role"]),
    ]:
        with op.batch_alter_table(table) as batch:
            for field in fields:
                batch.drop_column(field)
