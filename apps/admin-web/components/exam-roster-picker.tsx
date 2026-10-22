"use client";
import { useEffect, useState } from "react";
import { api, send, errorText, type Course } from "./api";
import { Form } from "./shared";

type Candidate = {
  id: string;
  name: string;
  username: string;
  email: string | null;
  assigned: boolean;
};
type Section = { id: string; name: string; student_count: number };

export default function ExamRosterPicker({
  examId,
  courseId,
  courses,
  added,
}: {
  examId: string;
  courseId: string;
  courses: Course[];
  added: (message: string) => Promise<void>;
}) {
  const [source, setSource] = useState(courseId);
  const [section, setSection] = useState("");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [version, setVersion] = useState(0);
  const [data, setData] = useState<{
    key: string;
    source: string;
    students: Candidate[];
    classes: Section[];
  } | null>(null);
  const [error, setError] = useState<{ key: string; text: string } | null>(
    null,
  );
  const key = `${source}/${section}/${version}`;
  useEffect(() => {
    let active = true;
    const params = new URLSearchParams({ course_id: source });
    if (section) params.set("class_id", section);
    Promise.all([
      api<Candidate[]>(`/admin/exams/${examId}/roster-candidates?${params}`),
      api<Section[]>(`/admin/courses/${source}/classes`),
    ])
      .then(([students, classes]) => {
        if (active) setData({ key, source, students, classes });
      })
      .catch((e) => {
        if (active) setError({ key, text: errorText(e) });
      });
    return () => {
      active = false;
    };
  }, [examId, source, section, key]);
  const ready = data?.key === key;
  const students = ready ? data.students : [];
  const visible = students.filter((s) =>
    `${s.name} ${s.username} ${s.email || ""}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  const available = visible.filter((s) => !s.assigned);
  return (
    <details open>
      <summary>Thêm học viên từ môn / lớp học phần</summary>
      <Form
        label={`Thêm ${selected.length} học viên vào kỳ thi`}
        onSubmit={async () => {
          if (!ready || !selected.length)
            throw new Error("Chọn ít nhất một học viên chưa có trong kỳ thi.");
          const result = await send<{ added: number; skipped: number }>(
            `/admin/exams/${examId}/select-students`,
            {
              course_id: source,
              class_id: section || null,
              student_ids: selected,
            },
          );
          setSelected([]);
          setVersion((v) => v + 1);
          await added(
            `Đã thêm ${result.added} học viên; bỏ qua ${result.skipped} học viên đã có.`,
          );
        }}
      >
        <label>
          Môn lấy danh sách
          <select
            value={source}
            onChange={(e) => {
              setSource(e.target.value);
              setSection("");
              setSelected([]);
            }}
          >
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.code} · {c.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Lớp học phần
          <select
            value={section}
            onChange={(e) => {
              setSection(e.target.value);
              setSelected([]);
            }}
          >
            <option value="">Tất cả học viên trong môn</option>
            {(data?.source === source ? data.classes : []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.student_count})
              </option>
            ))}
          </select>
        </label>
        <label>
          Tìm học viên
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Tên, email hoặc tài khoản"
          />
        </label>
        {!ready && error?.key !== key && (
          <p role="status">Đang tải danh sách…</p>
        )}
        {error?.key === key && (
          <p role="alert" className="error">
            {error.text}
          </p>
        )}
        {ready && (
          <>
            <p>
              {students.length} học viên ·{" "}
              {students.filter((s) => s.assigned).length} đã có trong kỳ thi ·{" "}
              {selected.length} đang chọn.
            </p>
            <label>
              <input
                type="checkbox"
                disabled={!available.length}
                checked={
                  !!available.length &&
                  available.every((s) => selected.includes(s.id))
                }
                onChange={(e) =>
                  setSelected(
                    e.target.checked
                      ? [
                          ...new Set([
                            ...selected,
                            ...available.map((s) => s.id),
                          ]),
                        ]
                      : selected.filter(
                          (id) => !available.some((s) => s.id === id),
                        ),
                  )
                }
              />
              Chọn tất cả học viên đang hiển thị chưa có trong kỳ thi
            </label>
            <div className="check-grid scroll-list">
              {visible.map((s) => (
                <label className="check" key={s.id}>
                  <input
                    type="checkbox"
                    disabled={s.assigned}
                    checked={s.assigned || selected.includes(s.id)}
                    onChange={(e) =>
                      setSelected(
                        e.target.checked
                          ? [...selected, s.id]
                          : selected.filter((id) => id !== s.id),
                      )
                    }
                  />
                  {s.name}
                  <small>
                    {s.email || s.username}
                    {s.assigned ? " · Đã có trong kỳ thi" : ""}
                  </small>
                </label>
              ))}
            </div>
            {!visible.length && (
              <p>
                Không có học viên phù hợp. Thêm học viên và xếp lớp tại Môn học
                → Học viên.
              </p>
            )}
          </>
        )}
        <p>
          Chỉ thêm tài khoản sinh viên đang hoạt động. Lịch thi được xếp sau khi
          thêm danh sách; MSSV có thể bổ sung qua Excel.
        </p>
      </Form>
    </details>
  );
}
