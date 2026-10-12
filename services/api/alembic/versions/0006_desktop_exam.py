"""Persist per-sitting screen recording requirement and consent."""
import sqlalchemy as sa

from alembic import op

revision = "0006"
down_revision = "0005"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("exam_sessions", sa.Column("screen_required", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column("exam_sessions", sa.Column("screen_consent_at", sa.Float(), nullable=True))


def downgrade():
    with op.batch_alter_table("exam_sessions") as batch:
        batch.drop_column("screen_consent_at")
        batch.drop_column("screen_required")
