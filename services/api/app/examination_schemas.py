from typing import Annotated

from pydantic import Field, field_validator, model_validator

from .schemas import Criterion, Input, QuestionOutput

Hotword = Annotated[str, Field(min_length=1, max_length=100)]


class HotwordsIn(Input):
    hotwords: list[Hotword] = Field(default_factory=list, max_length=500)

    @field_validator("hotwords", mode="before")
    @classmethod
    def clean_words(cls, value):
        if isinstance(value, list) and all(isinstance(word, str) for word in value):
            return list(dict.fromkeys(word.strip() for word in value if word.strip()))
        return value

    @model_validator(mode="after")
    def normalize(self):
        if sum(map(len, self.hotwords)) > 10000:
            raise ValueError("Tổng hotword của môn học không vượt 10.000 ký tự")
        return self


class TeacherIn(Input):
    teacher_id: str


class CommissionIn(TeacherIn):
    course_id: str
    name: str = Field(min_length=1, max_length=200)
    time_limit: int = Field(default=900, ge=60, le=10800)


class DraftReviewIn(Input):
    questions: list[QuestionOutput] = Field(min_length=1, max_length=20)
    criteria: list[Criterion] = Field(min_length=1, max_length=20)

    @model_validator(mode="after")
    def names(self):
        if len({c.name for c in self.criteria}) != len(self.criteria):
            raise ValueError("Tên tiêu chí phải duy nhất")
        return self


class ScheduleIn(Input):
    student_ids: list[str] = Field(min_length=1, max_length=5000)
    opens_at: float = Field(gt=0, allow_inf_nan=False)
    closes_at: float = Field(gt=0, allow_inf_nan=False)

    @model_validator(mode="after")
    def ordered(self):
        if self.closes_at <= self.opens_at:
            raise ValueError("Giờ đóng phải sau giờ mở")
        return self


class ManualGradeIn(Input):
    score: float = Field(ge=0, le=10, allow_inf_nan=False)
    reason: str = Field(min_length=10, max_length=3000)
