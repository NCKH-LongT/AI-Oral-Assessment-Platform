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
  const [classes, setClasses] = useState<
    { id: string; name: string; student_count: number }[]
  >([]);
  const load = useCallback(async () => {
    const [students, sections] = await Promise.all([
      api<string[]>(`/admin/courses/${courseId}/students`),
      api<{ id: string; name: string; student_count: number }[]>(
        `/admin/courses/${courseId}/classes`,
      ),
    ]);
    setIds(students);
    setClasses(sections);
  }, [courseId]);
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
      {admin && !!ids.length && (
        <details>
          <summary>Lớp học phần trong môn</summary>
          <p>
            Mỗi học viên thuộc tối đa một lớp trong môn này. Xếp sang lớp khác
            sẽ chuyển học viên khỏi lớp cũ, không thay đổi danh sách kỳ thi đã
            giao.
          </p>
          {classes.map((c) => (
            <p key={c.id}>
              {c.name} · {c.student_count} học viên
            </p>
          ))}
          <Form
            label="Lưu lớp và xếp học viên"
            onSubmit={async (d) => {
              await send(`/admin/courses/${courseId}/classes`, {
                name: String(d.get("class_name")).trim(),
                student_ids: d.getAll("class_students"),
              });
              await load();
            }}
          >
            <label>
              Tên lớp học phần
              <input
                name="class_name"
                required
                maxLength={100}
                list={`classes-${courseId}`}
                placeholder="Ví dụ: SE1801 – SWT301"
              />
              <datalist id={`classes-${courseId}`}>
                {classes.map((c) => (
                  <option key={c.id} value={c.name} />
                ))}
              </datalist>
            </label>
            <p>
              Nhập tên mới để tạo lớp, hoặc chọn tên đã có để thêm học viên vào
              lớp đó.
            </p>
            <div className="check-grid scroll-list">
              {users
                .filter((u) => ids.includes(u.id) && u.role === "STUDENT")
                .map((u) => (
                  <label className="check" key={u.id}>
                    <input type="checkbox" name="class_students" value={u.id} />
                    {u.name}
                    <small>{u.email || u.username}</small>
                  </label>
                ))}
            </div>
          </Form>
        </details>
      )}
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
