"use client";
import { useEffect, useState } from "react";
import { api, send, errorText, Criterion } from "./api";
import { Action, Badge, Empty, Form } from "./shared";

type Question = {
  text: string;
  expected_concepts: string[];
  reference_chunk_ids: string[];
  english_terms: { term: string; meaning: string }[];
  difficulty: string;
};
type Draft = {
  status: string;
  snapshot: { questions: Question[]; criteria: Criterion[] } | null;
};

export default function ExamDraftReview({
  examId,
  editable,
  refresh,
}: {
  examId: string;
  editable: boolean;
  refresh: () => Promise<unknown>;
}) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState("");
  const [dirty, setDirty] = useState(false);
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    let active = true;
    api<Draft>(`/admin/exams/${examId}/draft`)
      .then((value) => {
        if (active) setDraft(value);
      })
      .catch((e) => {
        if (active) setError(errorText(e));
      });
    return () => {
      active = false;
    };
  }, [examId]);
  if (!draft) return <Empty>{error || "Đang tải đề…"}</Empty>;
  if (!draft.snapshot)
    return (
      <p>
        Giảng viên cấu hình số câu và độ khó trong Môn học & đề thi, sau đó sinh
        đề.
      </p>
    );
  const snapshot = draft.snapshot;
  const canEdit = editable && draft.status === "GENERATED";
  function updateQuestion(index: number, patch: Partial<Question>) {
    setDraft({
      ...draft!,
      snapshot: {
        ...snapshot,
        questions: snapshot.questions.map((q, i) =>
          i === index ? { ...q, ...patch } : q,
        ),
      },
    });
    setDirty(true);
    setSaved(false);
  }
  function updateCriterion(index: number, patch: Partial<Criterion>) {
    setDraft({
      ...draft!,
      snapshot: {
        ...snapshot,
        criteria: snapshot.criteria.map((c, i) =>
          i === index ? { ...c, ...patch } : c,
        ),
      },
    });
    setDirty(true);
    setSaved(false);
  }
  return (
    <section className="panel">
      <div className="section-title">
        <h3>Review câu hỏi & rubric</h3>
        <Badge status={draft.status} />
      </div>
      <Form
        label={canEdit ? "Lưu nội dung đã review" : "Tải lại nội dung"}
        onSubmit={async () => {
          if (canEdit) {
            await send(
              `/admin/exams/${examId}/draft`,
              {
                questions: snapshot.questions.map(
                  ({
                    text,
                    expected_concepts,
                    reference_chunk_ids,
                    english_terms,
                  }) => ({
                    text,
                    expected_concepts,
                    reference_chunk_ids,
                    english_terms,
                  }),
                ),
                criteria: snapshot.criteria,
              },
              "PUT",
            );
            setDirty(false);
            setSaved(true);
          } else setDraft(await api<Draft>(`/admin/exams/${examId}/draft`));
        }}
      >
        {snapshot.questions.map((q, i) => (
          <fieldset key={i} disabled={!canEdit}>
            <legend>
              Câu {i + 1} ·{" "}
              {
                (
                  { EASY: "Dễ", MEDIUM: "Trung bình", HARD: "Khó" } as Record<
                    string,
                    string
                  >
                )[q.difficulty]
              }
            </legend>
            <label>
              Nội dung câu hỏi
              <textarea
                required
                minLength={10}
                maxLength={4000}
                value={q.text}
                onChange={(e) => updateQuestion(i, { text: e.target.value })}
              />
            </label>
            <label>
              Ý chính mong đợi (mỗi dòng một ý)
              <textarea
                required
                value={q.expected_concepts.join("\n")}
                onChange={(e) =>
                  updateQuestion(i, {
                    expected_concepts: e.target.value.split("\n"),
                  })
                }
              />
            </label>
            {!!q.english_terms.length && (
              <p>
                {q.english_terms
                  .map((t) => `${t.term}: ${t.meaning}`)
                  .join(" · ")}
              </p>
            )}
            <small>Nguồn tài liệu: {q.reference_chunk_ids.join(", ")}</small>
          </fieldset>
        ))}
        <h4>Rubric chấm điểm</h4>
        {snapshot.criteria.map((c, i) => (
          <fieldset key={i} disabled={!canEdit}>
            <legend>Tiêu chí {i + 1}</legend>
            <label>
              Tên
              <input
                required
                maxLength={100}
                value={c.name}
                onChange={(e) => updateCriterion(i, { name: e.target.value })}
              />
            </label>
            <label>
              Mô tả
              <textarea
                required
                value={c.description}
                onChange={(e) =>
                  updateCriterion(i, { description: e.target.value })
                }
              />
            </label>
            <div className="inline">
              <label>
                Điểm tối đa
                <input
                  type="number"
                  min="0.1"
                  max="100"
                  step="0.1"
                  required
                  value={c.max_score}
                  onChange={(e) =>
                    updateCriterion(i, { max_score: Number(e.target.value) })
                  }
                />
              </label>
              <label>
                Trọng số
                <input
                  type="number"
                  min="0.1"
                  max="100"
                  step="0.1"
                  required
                  value={c.weight}
                  onChange={(e) =>
                    updateCriterion(i, { weight: Number(e.target.value) })
                  }
                />
              </label>
            </div>
          </fieldset>
        ))}
      </Form>
      {saved && <p role="status">Đã lưu nội dung review.</p>}
      {canEdit && (
        <Action
          disabled={dirty}
          action={async () => {
            await send(`/admin/exams/${examId}/teacher-approve`);
            setDraft(await api<Draft>(`/admin/exams/${examId}/draft`));
            await refresh();
          }}
        >
          Duyệt đề & gửi khảo thí
        </Action>
      )}
      {dirty && <p>Lưu các thay đổi trước khi duyệt đề.</p>}
    </section>
  );
}
