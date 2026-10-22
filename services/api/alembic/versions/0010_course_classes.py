"""Course sections for enrollment and examination roster selection."""
from alembic import op
import sqlalchemy as sa

revision = "0010"
down_revision = "0009"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "course_classes",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("created_at", sa.Float(), nullable=False),
        sa.Column("course_id", sa.String(36), sa.ForeignKey("courses.id"), nullable=False),
        sa.Column("name", sa.String(100), nullable=False),
        sa.UniqueConstraint("course_id", "name"),
    )
    with op.batch_alter_table("course_enrollments") as batch:
        batch.add_column(sa.Column("class_id", sa.String(36), nullable=True))
        batch.create_foreign_key("fk_enrollment_class", "course_classes", ["class_id"], ["id"])


def downgrade():
    with op.batch_alter_table("course_enrollments") as batch:
        batch.drop_constraint("fk_enrollment_class", type_="foreignkey")
        batch.drop_column("class_id")
    op.drop_table("course_classes")
