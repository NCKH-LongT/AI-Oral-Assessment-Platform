"""Persist question preparation clocks across client reconnects."""
import sqlalchemy as sa

from alembic import op

revision = "0009"
down_revision = "0008"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("question_attempts", sa.Column("prepared_at", sa.Float(), nullable=True))


def downgrade():
    op.drop_column("question_attempts", "prepared_at")
