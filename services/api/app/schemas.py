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
    learning_outcome_id: str
    name: str = Field(min_length=1, max_length=200)
    description: str = Field(default="", max_length=3000)


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
