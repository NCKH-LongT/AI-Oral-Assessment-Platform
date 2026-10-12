"use client";
import { useCallback, useEffect, useState } from "react";
import { api, send, errorText, type User } from "./api";
import { Action } from "./shared";

type Course = {
  id: string;
  code: string;
  name: string;
  status: string;
  enrolled: boolean;
  assigned: boolean;
};
export default function StudentCourses({
  student,
  editable,
  back,
}: {
  student: User;
  editable: boolean;
  back: () => void;
}) {
  const [courses, setCourses] = useState<Course[]>([]);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState("");
  const load = useCallback(async () => {
    const data = await api<{ courses: Course[] }>(
      `/admin/users/${student.id}/courses`,
    );
    setCourses(data.courses);
  }, [student.id]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- State follows the asynchronous enrollment response.
    void load().catch((e) => setError(errorText(e)));
  }, [load]);
  return (
    <section className="panel">
      <button className="text-button" onClick={back}>
        ← Danh sách người dùng
      </button>
      <h1>{student.name}</h1>
      <p>{student.email || student.username}</p>
      <h2>Môn học của sinh viên</h2>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {courses
        .filter((c) => c.enrolled || c.assigned)
        .map((c) => (
          <div className="list-item" key={c.id}>
            <span className="grow">
              {c.code} — {c.name}
              {c.assigned ? " · Có đề được giao riêng" : ""}
            </span>
            {editable && (
              <Action
                className="text-button danger"
                action={async () => {
                  if (
                    !window.confirm(
                      `Gỡ môn ${c.code} và thu hồi các đề/lịch thi đã giao trong môn? Lịch sử bài làm được giữ lại.`,
                    )
                  )
                    return;
                  await send(
                    `/admin/users/${student.id}/courses/${c.id}`,
                    undefined,
                    "DELETE",
                  );
                  await load();
                }}
              >
                Gỡ môn
              </Action>
            )}
          </div>
        ))}
      {!courses.some((c) => c.enrolled || c.assigned) && (
        <p>Chưa có môn được giao.</p>
      )}
      {editable && (
        <>
          <label>
            Thêm môn cho sinh viên
            <select
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
            >
              <option value="">Chọn môn học</option>
              {courses
                .filter((c) => !c.enrolled && c.status === "ACTIVE")
                .map((c) => (
                  <option value={c.id} key={c.id}>
                    {c.code} — {c.name}
                  </option>
                ))}
            </select>
          </label>
          <Action
            disabled={!selected}
            action={async () => {
              await send(
                `/admin/users/${student.id}/courses/${selected}`,
                undefined,
                "PUT",
              );
              setSelected("");
              await load();
            }}
          >
            Thêm môn
          </Action>
          <p className="muted">
            Kỳ thi theo lịch vẫn cần khảo thí thêm sinh viên vào danh sách và
            xếp lịch. Gỡ môn thu hồi quyền vào thi mới, không xóa bài đã làm.
          </p>
        </>
      )}
    </section>
  );
}
