"use client";
import { useState } from "react";
import { api, send, Chapter, Topic, Workspace } from "./api";
import { Action, Badge, Field, Form } from "./shared";

type Props = {
  courseId: string;
  data: Workspace;
  editable: boolean;
  reload: () => Promise<void>;
};

export function TextbookPanel({ courseId, data, editable, reload }: Props) {
  const book = data.documents.find((d) => d.kind === "TEXTBOOK");
  const [editing, setEditing] = useState<Chapter | null>(null);
  const chapters = [...data.chapters].sort(
    (a, b) => a.start_page - b.start_page || a.level - b.level,
  );
  return (
    <section className="panel">
      <h2>Giáo trình PDF & mục lục</h2>
      <p className="muted">
        Một PDF dùng chung cho cả môn. Chương/mục là phạm vi trang trong PDF
        gốc; kiểm tra gợi ý tự động trước khi gắn vào chủ đề. Số trang tính từ
        trang đầu file, không theo số in trên sách.
      </p>
      {book ? (
        <div className="notice">
          <strong>
            {book.filename} · {book.page_count ?? "…"} trang
          </strong>
          <Badge status={book.status} />
          <a
            className="text-button"
            href={`/api/admin/documents/${book.id}/content`}
            download
          >
            Tải PDF gốc để đối chiếu
          </a>
          {book.error && <p role="alert">{book.error}</p>}
        </div>
      ) : (
        editable && (
          <Form
            label="Tải giáo trình PDF"
            onSubmit={async (d) => {
              d.set("kind", "TEXTBOOK");
              await api(`/admin/courses/${courseId}/documents`, {
                method: "POST",
                body: d,
              });
              await reload();
            }}
          >
            <label>
              File giáo trình (tối đa 100 MB)
              <input type="file" name="file" accept=".pdf" required />
            </label>
          </Form>
        )
      )}
      {editable && book?.status === "FAILED" && (
        <Form
          label="Thay PDF bị lỗi"
          onSubmit={async (d) => {
            await api(`/admin/documents/${book.id}/file`, {
              method: "PUT",
              body: d,
            });
            await reload();
          }}
        >
          <label>
            PDF đã sửa
            <input type="file" name="file" accept=".pdf" required />
          </label>
        </Form>
      )}
      {chapters.map((c) => (
        <div className="list-item" key={c.id}>
          <div style={{ paddingLeft: (c.level - 1) * 16 }}>
            <strong>{c.title}</strong>
            <p>
              Trang {c.start_page}–{c.end_page} · Cấp {c.level} ·{" "}
              {c.source === "MANUAL"
                ? "Đã chỉnh thủ công"
                : "Gợi ý, cần kiểm tra"}
            </p>
          </div>
          {editable && (
            <div className="actions">
              <button className="text-button" onClick={() => setEditing(c)}>
                Sửa mục
              </button>
              <Action
                className="text-button danger"
                action={async () => {
                  await send(`/admin/chapters/${c.id}`, undefined, "DELETE");
                  await reload();
                }}
              >
                Xóa mục
              </Action>
            </div>
          )}
        </div>
      ))}
      {editable && book?.status === "READY" && (
        <Form
          key={editing?.id || "new"}
          label={editing ? "Lưu mục lục" : "Thêm chương/mục"}
          onSubmit={async (d) => {
            const body = {
              title: d.get("title"),
              level: Number(d.get("level")),
              start_page: Number(d.get("start_page")),
              end_page: Number(d.get("end_page")),
            };
            await send(
              editing
                ? `/admin/chapters/${editing.id}`
                : `/admin/documents/${book.id}/chapters`,
              body,
              editing ? "PUT" : "POST",
            );
            setEditing(null);
            await reload();
          }}
        >
          <Field
            label="Tên chương / tiêu đề mục"
            name="title"
            defaultValue={editing?.title}
          />
          <div className="form-grid">
            <Field
              label="Cấp tiêu đề (1 = chương)"
              name="level"
              type="number"
              min={1}
              max={6}
              defaultValue={editing?.level || 1}
            />
            <Field
              label="Từ trang PDF"
              name="start_page"
              type="number"
              min={1}
              max={book.page_count || 1}
              defaultValue={editing?.start_page || 1}
            />
            <Field
              label="Đến trang PDF"
              name="end_page"
              type="number"
              min={1}
              max={book.page_count || 1}
              defaultValue={editing?.end_page || book.page_count || 1}
            />
          </div>
          {editing && (
            <button
              type="button"
              className="text-button"
              onClick={() => setEditing(null)}
            >
              Hủy sửa
            </button>
          )}
        </Form>
      )}
    </section>
  );
}

function Choices({
  name,
  label,
  options,
  selected = [],
}: {
  name: string;
  label: string;
  options: { id: string; label: string }[];
  selected?: string[];
}) {
  return (
    <fieldset className="choice-list">
      <legend>{label}</legend>
      {options.length ? (
        options.map((o) => (
          <label key={o.id}>
            <input
              type="checkbox"
              name={name}
              value={o.id}
              defaultChecked={selected.includes(o.id)}
            />
            {o.label}
          </label>
        ))
      ) : (
        <p className="muted">Chưa có dữ liệu để chọn.</p>
      )}
    </fieldset>
  );
}

export function TopicPanel({ courseId, data, editable, reload }: Props) {
  const [editing, setEditing] = useState<Topic | null>(null);
  return (
    <section className="panel">
      <h2>Chủ đề · nhiều LO, chương và tài liệu</h2>
      {data.topics.map((t) => (
        <div className="list-item" key={t.id}>
          <div>
            <strong>{t.name}</strong>
            <p>
              {data.outcomes
                .filter((l) => t.learning_outcome_ids.includes(l.id))
                .map((l) => l.code)
                .join(", ")}{" "}
              · {t.description}
            </p>
            <p>
              {data.chapters
                .filter((c) => t.chapter_ids.includes(c.id))
                .map((c) => c.title)
                .join("; ") || "Chưa gắn chương — dữ liệu cũ"}
            </p>
            <small>
              {t.document_ids.length} tài liệu bổ sung · {t.chapter_ids.length}{" "}
              chương/mục giáo trình
            </small>
          </div>
          {editable && (
            <div className="actions">
              <button className="text-button" onClick={() => setEditing(t)}>
                Sửa chủ đề
              </button>
              <Action
                className="text-button danger"
                action={async () => {
                  await send(`/admin/topics/${t.id}`, undefined, "DELETE");
                  await reload();
                }}
              >
                Xóa
              </Action>
            </div>
          )}
        </div>
      ))}
      {editable && (
        <Form
          key={editing?.id || "new"}
          label={editing ? "Lưu chủ đề" : "Thêm chủ đề"}
          onSubmit={async (d) => {
            const los = d.getAll("learning_outcome_ids"),
              chapters = d.getAll("chapter_ids");
            if (!los.length || !chapters.length)
              throw new Error(
                "Chọn ít nhất một LO và một chương/mục giáo trình.",
              );
            await send(
              editing
                ? `/admin/topics/${editing.id}`
                : `/admin/courses/${courseId}/topics`,
              {
                name: d.get("name"),
                description: d.get("description"),
                learning_outcome_ids: los,
                chapter_ids: chapters,
                document_ids: d.getAll("document_ids"),
              },
              editing ? "PUT" : "POST",
            );
            setEditing(null);
            await reload();
          }}
        >
          <Field label="Tên chủ đề" name="name" defaultValue={editing?.name} />
          <Field
            label="Mô tả chủ đề"
            name="description"
            required={false}
            defaultValue={editing?.description}
          />
          <Choices
            name="learning_outcome_ids"
            label="Chuẩn đầu ra (chọn ít nhất 1)"
            options={data.outcomes.map((l) => ({
              id: l.id,
              label: l.code + " · " + l.description,
            }))}
            selected={editing?.learning_outcome_ids}
          />
          <Choices
            name="chapter_ids"
            label="Chương/mục giáo trình (chọn ít nhất 1)"
            options={data.chapters.map((c) => ({
              id: c.id,
              label: `${c.title} (tr. ${c.start_page}–${c.end_page})`,
            }))}
            selected={editing?.chapter_ids}
          />
          <Choices
            name="document_ids"
            label="Tài liệu bổ sung (có thể chọn nhiều)"
            options={data.documents
              .filter((d) => d.kind === "SUPPLEMENT")
              .map((d) => ({ id: d.id, label: d.filename }))}
            selected={editing?.document_ids}
          />
          <p className="muted">
            Giáo trình được dùng qua các chương đã chọn. Có thể tải thêm nhiều
            tài liệu bên dưới và gắn cùng tài liệu vào nhiều chủ đề. Đề đã công
            bố giữ nguyên phạm vi kiến thức.
          </p>
          {editing && (
            <button
              type="button"
              className="text-button"
              onClick={() => setEditing(null)}
            >
              Hủy sửa chủ đề
            </button>
          )}
        </Form>
      )}
    </section>
  );
}
