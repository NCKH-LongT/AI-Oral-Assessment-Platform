"""Grading availability, safe failure messages and compatible review versions."""

import httpx
from pydantic import ValidationError

from . import ai


class GradingError(ValueError):
    def __init__(self, code, message):
        super().__init__(message)
        self.code = code


def check_config(exam):
    snapshot = exam.snapshot or {}
    if snapshot.get("practice"):
        return
    current = {"ai_provider": ai.settings().ai_provider, "llm_model": ai.settings().llm_model,
               "embedding_model": ai.embedding_name(), "prompt_version": ai.PROMPT_VERSION}
    if any(snapshot.get(k) != v for k, v in current.items()):
        raise GradingError(
            "AI_CONFIG_MISMATCH",
            "Cấu hình AI của đề không khớp máy chủ. Cần xử lý tài liệu và tạo phiên bản đề với cấu hình AI hiện tại.",
        )


def failure(exc):
    # Never expose exception messages from providers: they may contain credentials.
    if isinstance(exc, GradingError):
        return exc.code, str(exc)
    if isinstance(exc, (TimeoutError, httpx.TimeoutException)):
        return "AI_TIMEOUT", "Nhà cung cấp AI chưa phản hồi trong thời gian chờ. Có thể thử chấm lại transcript."
    if isinstance(exc, ValidationError) or str(exc) in {
        "Score exceeds rubric limit", "Grading criteria mismatch", "Invalid grading references"
    }:
        return "AI_OUTPUT_INVALID", "Kết quả AI không đúng thang điểm, tiêu chí hoặc dẫn chứng; kết quả đã bị từ chối."
    return "GRADING_FAILED", "Chấm tự động thất bại; cần giảng viên kiểm tra nhà cung cấp AI và thử lại."


def assessment_view(assessment, exam):
    """Normalize legacy placeholder zeros without rewriting stored results/history."""
    if not assessment:
        return assessment
    result = dict(assessment)
    if result.get("error"):
        result.update(confidence=None, status="FAILED")
        if not result.get("error_code"):
            try:
                check_config(exam)
            except GradingError as exc:
                result["error_code"], result["reasoning_summary"] = failure(exc)
    elif result.get("score") is None:
        result.update(confidence=None, status="NOT_GRADED")
    else:
        result.setdefault("status", "COMPLETED")
    return result


def review_question(source, target, attempt):
    """Allow new AI/evidence versions only for the exact same question and rubric."""
    if target.status != "PUBLISHED" or target.course_id != source.course_id:
        raise GradingError("INCOMPATIBLE_EXAM", "Phiên bản chấm phải được công bố trong cùng môn học.")
    old, new = source.snapshot or {}, target.snapshot or {}
    if old.get("practice") or new.get("practice") or new.get("ai_provider") == "demo":
        raise GradingError("GRADING_UNAVAILABLE", "Chọn đề có bật LLM thật; bài luyện tập không được chấm điểm.")
    if old.get("criteria") != new.get("criteria") or source.time_limit != target.time_limit:
        raise GradingError("INCOMPATIBLE_EXAM", "Phiên bản mới phải giữ nguyên rubric và thời lượng đề gốc.")
    check_config(target)
    # All question semantics must stay identical; only storage/reference IDs may change.
    def content(q):
        return {k: v for k, v in q.items() if k not in {
            "reference_chunk_ids", "topic_id", "learning_outcome_id", "learning_outcome_ids", "chapter_ids"}}
    matches = [q for q in new.get("questions", []) if content(q) == content(attempt.question)]
    if len(matches) != 1:
        raise GradingError("INCOMPATIBLE_EXAM", "Không tìm thấy đúng câu hỏi gốc trong phiên bản được chọn.")
    return matches[0]
