"""Departments, teaching classes and independent scheduled exam copies."""
import sqlalchemy as sa

from alembic import op

revision = "0010"
down_revision = "0009"
branch_labels = None
depends_on = None


def entity():
    return [sa.Column("id", sa.String(36), primary_key=True), sa.Column("created_at", sa.Float(), nullable=False)]


def upgrade():
    op.create_table("departments", *entity(), sa.Column("code", sa.String(50), nullable=False, unique=True), sa.Column("name", sa.String(200), nullable=False))
    with op.batch_alter_table("courses") as batch:
        batch.add_column(sa.Column("department_id", sa.String(36)))
        batch.create_foreign_key("fk_courses_department", "departments", ["department_id"], ["id"])
    op.create_index("ix_courses_department_id", "courses", ["department_id"])
    op.create_table("teaching_classes", *entity(),
        sa.Column("code", sa.String(50), nullable=False, unique=True), sa.Column("name", sa.String(200), nullable=False),
        sa.Column("course_id", sa.String(36), sa.ForeignKey("courses.id"), nullable=False),
        sa.Column("teacher_id", sa.String(36), sa.ForeignKey("users.id")),
        sa.Column("starts_at", sa.Float(), nullable=False), sa.Column("ends_at", sa.Float(), nullable=False))
    op.create_index("ix_teaching_classes_course_id", "teaching_classes", ["course_id"])
    op.create_index("ix_teaching_classes_teacher_id", "teaching_classes", ["teacher_id"])
    op.create_table("class_students", *entity(),
        sa.Column("class_id", sa.String(36), sa.ForeignKey("teaching_classes.id", ondelete="CASCADE"), nullable=False),
        sa.Column("student_id", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("student_number", sa.String(80)), sa.UniqueConstraint("class_id", "student_id"), sa.UniqueConstraint("class_id", "student_number"))
    op.create_index("ix_class_students_class_id", "class_students", ["class_id"])
    with op.batch_alter_table("exams") as batch:
        batch.add_column(sa.Column("class_id", sa.String(36)))
        batch.add_column(sa.Column("source_exam_id", sa.String(36)))
        batch.add_column(sa.Column("category", sa.String(100), nullable=False, server_default=""))
        batch.create_foreign_key("fk_exams_class", "teaching_classes", ["class_id"], ["id"])
        batch.create_foreign_key("fk_exams_source", "exams", ["source_exam_id"], ["id"], ondelete="SET NULL")
    op.create_index("ix_exams_class_id", "exams", ["class_id"])


def downgrade():
    op.drop_index("ix_exams_class_id", "exams")
    with op.batch_alter_table("exams") as batch:
        batch.drop_constraint("fk_exams_source", type_="foreignkey")
        batch.drop_constraint("fk_exams_class", type_="foreignkey")
        batch.drop_column("category")
        batch.drop_column("source_exam_id")
        batch.drop_column("class_id")
    op.drop_table("class_students")
    op.drop_table("teaching_classes")
    op.drop_index("ix_courses_department_id", "courses")
    with op.batch_alter_table("courses") as batch:
        batch.drop_constraint("fk_courses_department", type_="foreignkey")
        batch.drop_column("department_id")
    op.drop_table("departments")
