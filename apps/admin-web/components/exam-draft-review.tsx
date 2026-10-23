"use client";
import { useEffect, useState } from "react";
import { api, send, errorText, Criterion } from "./api";
import dynamic from "next/dynamic";
import { QuestionContent, type RichContent } from "./question-content";
import { Action, Badge, Empty, Form } from "./shared";

const QuestionEditor = dynamic(() => import("./question-editor"), {
  ssr: false,
  loading: () => <p>Đang tải editor…</p>,
});

type Question = {
  text: string;
  rich_content?: RichContent | null;
  preparation_seconds?: number;
  recording_seconds?: number;
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
  canApprove = editable,
  refresh,
}: {
  examId: string;
  editable: boolean;
  canApprove?: boolean;
  refresh: () => Promise<unknown>;
}) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState("");
  const [imageBusy, setImageBusy] = useState(false);
  const [editing, setEditing] = useState<number | null>(null);
  const [original, setOriginal] = useState<Question | null>(null);
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
        Giảng viên cấu hình số câu và độ khó trong Ngân hàng đề thi, sau đó sinh
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
            if (imageBusy) throw new Error("Chờ xử lý ảnh xong trước khi lưu.");
            if (
              snapshot.questions.some(
                (q) => q.text.trim().length < 10 || q.text.length > 4000,
              )
            )
              throw new Error("Mỗi câu cần từ 10 đến 4000 ký tự nội dung chữ.");
            await send(
              `/admin/exams/${examId}/draft`,
              {
                questions: snapshot.questions.map(
                  ({
                    text,
                    rich_content,
                    expected_concepts,
                    reference_chunk_ids,
                    english_terms,
                    preparation_seconds = 10,
                    recording_seconds = 60,
                  }) => ({
                    text,
                    rich_content,
                    expected_concepts,
                    reference_chunk_ids,
                    english_terms,
                    preparation_seconds,
                    recording_seconds,
                  }),
                ),
                criteria: snapshot.criteria,
              },
              "PUT",
            );
            setEditing(null);
            setOriginal(null);
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
            {editing === i ? (
              <QuestionEditor
                text={q.text}
                onBusy={setImageBusy}
                content={q.rich_content}
                onChange={(text, rich_content) =>
                  updateQuestion(i, { text, rich_content })
                }
              />
            ) : (
              <QuestionContent text={q.text} content={q.rich_content} />
            )}
            {canEdit &&
              (editing === i ? (
                <div className="inline">
                  <button
                    type="button"
                    className="button secondary"
                    disabled={imageBusy}
                    onClick={() => {
                      setEditing(null);
                      setOriginal(null);
                    }}
                  >
                    Xong câu {i + 1}
                  </button>
                  <button
                    type="button"
                    className="text-button"
                    disabled={imageBusy}
                    onClick={() => {
                      if (original) updateQuestion(i, original);
                      setEditing(null);
                      setOriginal(null);
                    }}
                  >
                    Hủy sửa câu {i + 1}
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  className="button secondary"
                  disabled={editing !== null}
                  onClick={() => {
                    setOriginal(structuredClone(q));
                    setEditing(i);
                  }}
                >
                  Sửa câu {i + 1}
                </button>
              ))}
            {editing !== i && (
              <p className="muted">
                Chuẩn bị {q.preparation_seconds ?? 10} giây · Trả lời tối đa{" "}
                {q.recording_seconds ?? 60} giây
              </p>
            )}
            <div hidden={editing !== i}>
              <div className="inline">
                <label>
                  Thời gian chuẩn bị (giây)
                  <input
                    type="number"
                    min={0}
                    max={600}
                    step={1}
                    required
                    value={q.preparation_seconds ?? 10}
                    onChange={(e) =>
                      updateQuestion(i, {
                        preparation_seconds: Number(e.target.value),
                      })
                    }
                  />
                </label>
                <label>
                  Thời gian trả lời tối đa (giây)
                  <input
                    type="number"
                    min={1}
                    max={1800}
                    step={1}
                    required
                    value={q.recording_seconds ?? 60}
                    onChange={(e) =>
                      updateQuestion(i, {
                        recording_seconds: Number(e.target.value),
                      })
                    }
                  />
                </label>
              </div>
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
            </div>
            {!!q.english_terms.length && (
              <p>
                {q.english_terms
                  .map((t) => `${t.term}: ${t.meaning}`)
                  .join(" · ")}
              </p>
            )}
            <small>
              Nguồn tham chiếu: {q.reference_chunk_ids.length} đoạn tài liệu
            </small>
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
      {canEdit && canApprove && (
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
      {dirty && (
        <p>
          Bấm Lưu nội dung đã review để lưu các thay đổi trước khi rời trang
          hoặc duyệt đề.
        </p>
      )}
    </section>
  );
}
