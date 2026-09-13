from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


class Input(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class Login(Input):
    username: str = Field(min_length=1, max_length=80)
    password: str = Field(min_length=1, max_length=128)


class UserIn(Login):
    password: str = Field(min_length=12, max_length=128)
    name: str = Field(min_length=1, max_length=150)
    role: Literal["ADMIN", "TEACHER", "STUDENT", "REVIEWER"] = "STUDENT"


class CourseIn(Input):
    code: str = Field(min_length=1, max_length=50)
    name: str = Field(min_length=1, max_length=200)
    description: str = Field(default="", max_length=10000)


class LOIn(Input):
    code: str = Field(min_length=1, max_length=50)
    description: str = Field(min_length=1, max_length=3000)
    weight: float = Field(default=1, gt=0, le=100)


class TopicIn(Input):
    learning_outcome_id: str | None = None
    learning_outcome_ids: list[str] = Field(default_factory=list, max_length=100)
    chapter_ids: list[str] = Field(default_factory=list, max_length=500)
    document_ids: list[str] = Field(default_factory=list, max_length=100)
    name: str = Field(min_length=1, max_length=200)
    description: str = Field(default="", max_length=3000)

    @model_validator(mode="after")
    def mappings(self):
        if not self.learning_outcome_ids and self.learning_outcome_id:
            self.learning_outcome_ids = [self.learning_outcome_id]
        if not self.learning_outcome_ids:
            raise ValueError("Chọn ít nhất một LO")
        if not self.chapter_ids and not self.learning_outcome_id:
            raise ValueError("Chọn ít nhất một chương/mục giáo trình")
        return self


class SectionIn(Input):
    title: str = Field(min_length=1, max_length=300)
    level: int = Field(default=1, ge=1, le=6)
    start_page: int = Field(ge=1)
    end_page: int = Field(ge=1)

    @model_validator(mode="after")
    def page_range(self):
        if self.end_page < self.start_page:
            raise ValueError("Trang kết thúc phải từ trang bắt đầu trở đi")
        return self


class SpeechPolicy(Input):
    provider: Literal["local", "google", "local_server"] = "local_server"
    preprocessing: Literal["off", "denoise"] = "denoise"
    language: Literal["vi", "en"] = "vi"


class ReviewIn(Input):
    reason: str = Field(min_length=5, max_length=2000)


class Criterion(Input):
    name: str = Field(min_length=1, max_length=100)
    description: str = Field(min_length=1, max_length=3000)
    max_score: float = Field(gt=0, le=100)
    weight: float = Field(default=1, gt=0, le=100)


class RubricIn(Input):
    name: str = Field(min_length=1, max_length=200)
    criteria: list[Criterion] = Field(min_length=1, max_length=20)

    @model_validator(mode="after")
    def unique_names(self):
        if len({c.name for c in self.criteria}) != len(self.criteria):
            raise ValueError("Tên tiêu chí phải duy nhất")
        return self


class Blueprint(Input):
    topic_id: str
    difficulty: Literal["EASY", "MEDIUM", "HARD"]
    count: int = Field(ge=1, le=20)


class ExamIn(Input):
    course_id: str
    rubric_id: str
    name: str = Field(min_length=1, max_length=200)
    time_limit: int = Field(ge=60, le=10800)
    blueprint: list[Blueprint] = Field(min_length=1, max_length=20)

    @model_validator(mode="after")
    def limit_questions(self):
        if sum(row.count for row in self.blueprint) > 20:
            raise ValueError("MVP giới hạn 20 câu mỗi bài")
        return self


class AssignIn(Input):
    student_ids: list[str] = Field(min_length=1, max_length=500)


class SessionIn(Input):
    exam_id: str


class TranscriptIn(Input):
    transcript: str = Field(min_length=1, max_length=30000)
    stt_confidence: float = Field(ge=0, le=1)


class UploadIn(Input):
    attempt_id: str
    kind: Literal["AUDIO", "VIDEO"]
    mime_type: Literal["audio/webm", "video/webm", "audio/mp4", "video/mp4", "audio/ogg"]
    size: int = Field(gt=0)
    sha256: str = Field(pattern=r"^[a-f0-9]{64}$")


class QuestionOutput(Input):
    text: str = Field(min_length=10, max_length=4000)
    expected_concepts: list[str] = Field(min_length=1, max_length=30)
    reference_chunk_ids: list[str] = Field(min_length=1, max_length=20)


class GradeCriterion(Input):
    name: str
    score: float = Field(ge=0, le=100)
    comment: str = Field(max_length=2000)


class GradeOutput(Input):
    confidence: float = Field(ge=0, le=1)
    criteria: list[GradeCriterion]
    missing_concepts: list[str]
    reasoning_summary: str = Field(max_length=3000)
    reference_chunk_ids: list[str] = Field(min_length=1)


class RoleIn(Input):
    role: Literal["ADMIN", "TEACHER", "STUDENT", "REVIEWER"]
