"""Track media cleanup and preserve Excel-authored draft questions."""
import sqlalchemy as sa

from alembic import op

revision = "0007"
down_revision = "0006"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("exams", sa.Column("imported_questions", sa.JSON(), nullable=True))
    op.add_column("exam_sessions", sa.Column("media_removed_at", sa.Float(), nullable=True))
    op.add_column("media_cleanup", sa.Column("byte_size", sa.BigInteger(), nullable=True))


def downgrade():
    for table, column in [("media_cleanup", "byte_size"), ("exam_sessions", "media_removed_at"), ("exams", "imported_questions")]:
        with op.batch_alter_table(table) as batch:
            batch.drop_column(column)
