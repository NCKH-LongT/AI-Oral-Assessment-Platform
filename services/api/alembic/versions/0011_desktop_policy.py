"""Freeze administrator desktop rules per sitting."""
import sqlalchemy as sa

from alembic import op

revision = "0011"
down_revision = "0010"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("exam_sessions", sa.Column("desktop_policy", sa.JSON(none_as_null=True), nullable=True))


def downgrade():
    op.drop_column("exam_sessions", "desktop_policy")
