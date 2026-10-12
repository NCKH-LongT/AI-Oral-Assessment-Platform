"use client";
import { useEffect, useState } from "react";
import { api, send, errorText } from "./api";
import { Form } from "./shared";
export default function CourseHotwords({
  courseId,
  courseName,
}: {
  courseId: string;
  courseName: string;
}) {
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    let active = true;
    api<{ hotwords: string[] }>(`/admin/courses/${courseId}/hotwords`)
      .then((r) => {
        if (active) {
          setValue(r.hotwords.join("\n"));
          setLoaded(true);
        }
      })
      .catch((e) => {
        if (active) setError(errorText(e));
      });
    return () => {
      active = false;
    };
  }, [courseId]);
  const words = [
    ...new Set(
      value
        .split("\n")
        .map((word) => word.trim())
        .filter(Boolean),
    ),
  ];
  const characters = words.reduce((total, word) => total + [...word].length, 0);
  const validation =
    words.length > 500
      ? "Mỗi môn lưu tối đa 500 thuật ngữ. Hãy rút gọn danh sách trước khi lưu."
      : words.some((word) => [...word].length > 100)
        ? "Mỗi thuật ngữ không vượt 100 ký tự."
        : characters > 10000
          ? "Tổng hotword của môn học không vượt 10.000 ký tự."
          : "";
  return (
    <details className="panel">
      <summary>Hotword STT của môn học</summary>
      <p>
        Danh sách riêng của môn <strong>{courseName}</strong>, không dùng cho
        môn khác. Từ vựng được cố định khi sinh đề; thay đổi áp dụng khi sinh đề
        mới.
      </p>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {!loaded && !error && <p role="status">Đang tải hotword của môn học…</p>}
      {loaded && (
        <Form
          label="Lưu hotword môn học"
          onSubmit={async () => {
            setSaved(false);
            if (validation) throw new Error(validation);
            const result = await send<{ hotwords: string[] }>(
              `/admin/courses/${courseId}/hotwords`,
              {
                hotwords: words,
              },
              "PUT",
            );
            setValue(result.hotwords.join("\n"));
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
          <p>
            {words.length}/500 thuật ngữ · {characters}/10.000 ký tự (không tính
            dòng trống và mục trùng).
          </p>
          <p>
            Mỗi thuật ngữ tối đa 100 ký tự. Dùng từ vựng chuyên ngành, không
            nhập đáp án.
          </p>
          {validation && (
            <p role="alert" className="error">
              {validation}
            </p>
          )}
        </Form>
      )}
      {saved && (
        <p role="status">
          Đã lưu {words.length} hotword cho môn {courseName}.
        </p>
      )}
    </details>
  );
}
