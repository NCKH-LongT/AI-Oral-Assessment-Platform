"use client";
import { useState } from "react";
import { api } from "./api";
import { Action } from "./shared";

type Kind = "courses" | "rubrics" | "exams" | "teachers" | "officers";
type Preview = {
  valid: boolean;
  rows: number;
  create: number;
  skip: number;
  errors: { row: number; message: string }[];
  items: { label: string; action: string }[];
};
const labels = {
  courses: "môn học",
  rubrics: "rubric",
  exams: "bài thi",
  teachers: "giảng viên",
  officers: "khảo thí",
};

export default function ExcelImport({
  kind,
  courseId,
  saved,
}: {
  kind: Kind;
  courseId?: string;
  saved: () => Promise<unknown>;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function upload(check: boolean) {
    if (!file) return;
    setBusy(true);
    setMessage("");
    try {
      const body = new FormData();
      body.append("file", file);
      const result = await api<Preview>(
        `/admin/imports/${kind}${check ? "/preview" : ""}`,
        { method: "POST", body },
      );
      setPreview(result);
      if (!check) {
        setPreview(null);
        setMessage(
          `Đã tạo ${result.create}, bỏ qua ${result.skip} bản ghi giống dữ liệu đã có.`,
        );
        await saved();
      }
    } catch (e) {
      setPreview(null);
      throw e;
    } finally {
      setBusy(false);
    }
  }
  return (
    <details className="panel">
      <summary>Nhập {labels[kind]} từ Excel</summary>
      <p>
        Tải mẫu, sửa sheet Data, rồi kiểm tra trước khi nhập. Không ghi đè dữ
        liệu đã có. File có lỗi sẽ không nhập dòng nào.
      </p>
      {kind === "exams" && (
        <p>
          Mỗi dòng là một câu hỏi có sẵn, kèm chủ đề và ý cần trả lời. Nhập
          thành bản nháp để giảng viên duyệt; cần rubric và chủ đề đã có trong
          môn.
        </p>
      )}
      {(kind === "teachers" || kind === "officers") && (
        <p>
          Nhập mật khẩu ban đầu riêng cho tài khoản mới (12–128 ký tự). File
          không thể nâng quyền hoặc đổi mật khẩu tài khoản đã có.
        </p>
      )}
      <a
        className="button secondary"
        href={`/api/admin/imports/${kind}/template.xlsx${courseId ? `?course_id=${encodeURIComponent(courseId)}` : ""}`}
        download
      >
        Tải mẫu Excel {labels[kind]}
      </a>
      <label>
        File Excel {labels[kind]}
        <input
          type="file"
          accept=".xlsx"
          disabled={busy}
          onChange={(e) => {
            setFile(e.target.files?.[0] || null);
            setPreview(null);
            setMessage("");
          }}
        />
      </label>
      <Action disabled={!file || busy} action={() => upload(true)}>
        Kiểm tra file {labels[kind]}
      </Action>
      {preview && (
        <div aria-label={`Kết quả kiểm tra ${labels[kind]}`}>
          <p>
            {preview.rows} dòng · Tạo mới: {preview.create} · Bỏ qua:{" "}
            {preview.skip} · Lỗi: {preview.errors.length}
            {preview.errors.length === 100 ? " (hiển thị tối đa 100)" : ""}
          </p>
          {!!preview.errors.length && (
            <ul role="alert">
              {preview.errors.map((e, i) => (
                <li key={i}>
                  Dòng {e.row}: {e.message}
                </li>
              ))}
            </ul>
          )}
          {!!preview.items.length && (
            <ul>
              {preview.items.slice(0, 20).map((i, n) => (
                <li key={n}>
                  {i.label} —{" "}
                  {i.action === "create" ? "Tạo mới" : "Đã có, bỏ qua"}
                </li>
              ))}
            </ul>
          )}
          {preview.items.length > 20 && (
            <p>Hiển thị 20/{preview.items.length} mục xem trước.</p>
          )}
          <Action
            disabled={!preview.valid || !preview.create || busy}
            action={() => upload(false)}
          >
            Nhập {preview.create} {labels[kind]}
          </Action>
        </div>
      )}
      {message && <p role="status">{message}</p>}
    </details>
  );
}
