"use client";
import { useEffect, useState } from "react";
import { api, send, errorText } from "./api";
import { Form } from "./shared";
export default function CourseHotwords({ courseId }: { courseId: string }) {
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    api<{ hotwords: string[] }>(`/admin/courses/${courseId}/hotwords`)
      .then((r) => setValue(r.hotwords.join("\n")))
      .catch((e) => setError(errorText(e)));
  }, [courseId]);
  return (
    <details className="panel">
      <summary>Hotword STT của môn học</summary>
      <p>
        Từ vựng chuyên ngành hỗ trợ nhận dạng. Danh sách được cố định khi sinh
        đề; thay đổi không tác động đề đã duyệt.
      </p>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <Form
        label="Lưu hotword môn học"
        onSubmit={async () => {
          await send(
            `/admin/courses/${courseId}/hotwords`,
            {
              hotwords: value
                .split("\n")
                .map((w) => w.trim())
                .filter(Boolean),
            },
            "PUT",
          );
          setSaved(true);
        }}
      >
        <label>
          Mỗi dòng một thuật ngữ
          <textarea
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setSaved(false);
            }}
            placeholder="PostgreSQL\nDependency Injection"
          />
        </label>
      </Form>
      {saved && <p role="status">Đã lưu hotword.</p>}
    </details>
  );
}
