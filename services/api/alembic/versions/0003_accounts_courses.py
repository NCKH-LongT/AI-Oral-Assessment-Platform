"""Google identities, one-time OAuth flows and course enrollment."""

import sqlalchemy as sa

from alembic import op

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("users") as batch:
        batch.add_column(sa.Column("email", sa.String(320), nullable=True))
        batch.add_column(sa.Column("google_sub", sa.String(255), nullable=True))
        batch.create_unique_constraint("uq_users_google_sub", ["google_sub"])
    op.create_table(
        "course_enrollments",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("created_at", sa.Float(), nullable=False),
        sa.Column("course_id", sa.String(36), sa.ForeignKey("courses.id"), nullable=False),
        sa.Column("student_id", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
        sa.UniqueConstraint("course_id", "student_id"),
    )
    op.create_table(
        "oauth_flows",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("created_at", sa.Float(), nullable=False),
        sa.Column("state_hash", sa.String(64), unique=True),
        sa.Column("nonce", sa.String(100), nullable=False),
        sa.Column("verifier", sa.String(100), nullable=False),
        sa.Column("poll_hash", sa.String(64)),
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id")),
        sa.Column("expires_at", sa.Float(), nullable=False),
        sa.Column("consumed", sa.Boolean(), nullable=False),
        sa.Column("completed", sa.Boolean(), nullable=False),
        sa.Column("failed", sa.Boolean(), nullable=False),
    )


def downgrade():
    op.drop_table("oauth_flows")
    op.drop_table("course_enrollments")
    with op.batch_alter_table("users") as batch:
        batch.drop_constraint("uq_users_google_sub", type_="unique")
        batch.drop_column("google_sub")
        batch.drop_column("email")
