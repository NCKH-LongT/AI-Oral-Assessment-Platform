"""Independent role grants; existing users retain their original role."""
import sqlalchemy as sa

from alembic import op

revision = "0012"
down_revision = "0011"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "user_roles",
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("role", sa.String(20), primary_key=True),
    )


def downgrade():
    # User.role keeps the highest-priority role for older application versions.
    op.drop_table("user_roles")
