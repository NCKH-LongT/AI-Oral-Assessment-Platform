"use client";
import { useCallback, useEffect, useState } from "react";
import { api, send, errorText, type User } from "./api";
import { Action, Empty, Form } from "./shared";
export default function CourseStudents({
  courseId,
  users,
  admin,
}: {
  courseId: string;
  users: User[];
  admin: boolean;
}) {
  const [ids, setIds] = useState<string[]>([]),
    [query, setQuery] = useState(""),
    [error, setError] = useState("");
  const load = useCallback(
    async () =>
      setIds(await api<string[]>(`/admin/courses/${courseId}/students`)),
    [courseId],
  );
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Updates follow the asynchronous enrollment request.
    load().catch((e) => setError(errorText(e)));
  }, [load]);
  return (
    <section className="panel">
      <h2>Học viên trong môn</h2>
      <p className="muted">
        Người được thêm vào môn sẽ thấy mọi đề đã công bố, kể cả đề công bố sau
        này. Đề nháp không hiển thị.
      </p>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {ids.map((id) => (
        <div className="list-item" key={id}>
          <span className="grow">
            {users.find((u) => u.id === id)?.name || id}
          </span>
          {admin && (
            <Action
              className="text-button danger"
              action={async () => {
                await send(
                  `/admin/courses/${courseId}/students/${id}`,
                  undefined,
                  "DELETE",
                );
                await load();
              }}
            >
              Bỏ khỏi môn
            </Action>
          )}
        </div>
      ))}
      {!ids.length && <Empty>Chưa giao môn cho học viên.</Empty>}
      {admin && (
        <Form
          label="Thêm vào môn học"
          onSubmit={async (d) => {
            await send(`/admin/courses/${courseId}/students`, {
              student_ids: d.getAll("student_ids"),
            });
            await load();
          }}
        >
          <label>
            Tìm người dùng
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Tên, email hoặc tài khoản"
            />
          </label>
          <div className="check-grid scroll-list">
            {users
              .filter(
                (u) =>
                  !ids.includes(u.id) &&
                  `${u.name} ${u.username} ${u.email || ""}`
                    .toLowerCase()
                    .includes(query.toLowerCase()),
              )
              .map((u) => (
                <label className="check" key={u.id}>
                  <input type="checkbox" name="student_ids" value={u.id} />
                  {u.name}
                  <small>{u.email || u.username}</small>
                </label>
              ))}
          </div>
        </Form>
      )}
      <p className="muted">
        Bỏ khỏi môn không xóa lịch sử thi và không thu hồi đề đã giao riêng. Môn
        luyện tập mặc định luôn mở cho mọi tài khoản.
      </p>
    </section>
  );
}
