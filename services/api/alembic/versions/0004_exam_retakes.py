"""Multiple exam sittings, per-student allowances and durable media cleanup."""

import sqlalchemy as sa

from alembic import op

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("exams", sa.Column("max_attempts", sa.Integer(), nullable=True, server_default="1"))
    op.add_column(
        "assignments", sa.Column("extra_attempts", sa.Integer(), nullable=False, server_default="0")
    )
    # MVP used an unnamed unique constraint on SQLite, a generated name on PostgreSQL.
    constraints = sa.inspect(op.get_bind()).get_unique_constraints("exam_sessions")
    old_name = next(
        (c["name"] for c in constraints if set(c["column_names"]) == {"exam_id", "student_id"}), None
    )
    with op.batch_alter_table(
        "exam_sessions", naming_convention={"uq": "uq_%(table_name)s_%(column_0_name)s"}
    ) as batch:
        batch.add_column(sa.Column("attempt_number", sa.Integer(), nullable=False, server_default="1"))
        batch.add_column(sa.Column("deleted_at", sa.Float(), nullable=True))
        batch.drop_constraint(old_name or "uq_exam_sessions_exam_id", type_="unique")
        batch.create_unique_constraint("uq_exam_session_attempt", ["exam_id", "student_id", "attempt_number"])
    op.create_index(
        "one_active_exam_session",
        "exam_sessions",
        ["exam_id", "student_id"],
        unique=True,
        postgresql_where=sa.text("deleted_at IS NULL AND status IN ('DEVICE_CHECK', 'IN_PROGRESS')"),
        sqlite_where=sa.text("deleted_at IS NULL AND status IN ('DEVICE_CHECK', 'IN_PROGRESS')"),
    )
    op.create_table(
        "media_cleanup",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("created_at", sa.Float(), nullable=False),
        sa.Column("upload_id", sa.String(36), nullable=False, unique=True),
        sa.Column("storage_key", sa.Text(), nullable=True),
        sa.Column("retries", sa.Integer(), nullable=False),
        sa.Column("next_attempt_at", sa.Float(), nullable=False),
    )


def downgrade():
    # Never discard additional sittings to fit the legacy unique constraint.
    duplicate = (
        op.get_bind()
        .execute(
            sa.text(
                "SELECT exam_id FROM exam_sessions GROUP BY exam_id, student_id HAVING COUNT(*) > 1 LIMIT 1"
            )
        )
        .first()
    )
    pending = op.get_bind().execute(sa.text("SELECT id FROM media_cleanup LIMIT 1")).first()
    deleted = (
        op.get_bind()
        .execute(sa.text("SELECT id FROM exam_sessions WHERE deleted_at IS NOT NULL LIMIT 1"))
        .first()
    )
    if duplicate or pending or deleted:
        raise RuntimeError("Cannot downgrade while multiple/deleted sittings or media cleanup jobs exist")
    op.drop_table("media_cleanup")
    op.drop_index("one_active_exam_session", table_name="exam_sessions")
    with op.batch_alter_table("exam_sessions") as batch:
        batch.drop_constraint("uq_exam_session_attempt", type_="unique")
        batch.create_unique_constraint("uq_exam_sessions_exam_student", ["exam_id", "student_id"])
        batch.drop_column("attempt_number")
        batch.drop_column("deleted_at")
    with op.batch_alter_table("assignments") as batch:
        batch.drop_column("extra_attempts")
    with op.batch_alter_table("exams") as batch:
        batch.drop_column("max_attempts")
