"use client";
import { hasRole } from "./api";
import { useCallback, useEffect, useState } from "react";
import { api, send, errorText, Course, User, Review } from "./api";
import { Action, Badge, Empty, Field, Form, Modal } from "./shared";
import { ReviewPage } from "./admin";

type Department = { id: string; code: string; name: string };
type ClassRow = {
  id: string;
  code: string;
  name: string;
  course_id: string;
  course_name: string;
  teacher_id: string | null;
  teacher_name: string | null;
  starts_at: number;
  ends_at: number;
  student_count: number;
};
type Round = { id: string; name: string; opens_at: number; closes_at: number };
type Detail = ClassRow & {
  students: {
    id: string;
    name: string;
    email: string;
    student_number: string | null;
  }[];
  rounds: Round[];
  bank: { id: string; name: string; category: string; rubric_name: string }[];
};
type ResultRow = {
  student_id: string;
  student_name: string;
  student_number: string | null;
  sessions: {
    id: string;
    attempt_number: number;
    status: string;
    final_score: number | null;
  }[];
};
const stamp = (value: FormDataEntryValue | null) =>
  new Date(String(value)).getTime() / 1000;
const localDate = (value?: number) =>
  value
    ? new Date(
        value * 1000 - new Date(value * 1000).getTimezoneOffset() * 60000,
      )
        .toISOString()
        .slice(0, 16)
    : "";
const date = (value: number) => new Date(value * 1000).toLocaleString("vi-VN");

function ImportFile({
  title,
  path,
  template,
  saved,
}: {
  title: string;
  path: string;
  template: string;
  saved: () => Promise<unknown>;
}) {
  const [message, setMessage] = useState("");
  return (
    <details className="panel">
      <summary>{title}</summary>
      <p>
        File .xlsx tối đa 2 MB. Kiểm tra toàn bộ dữ liệu trước khi lưu; file có
        lỗi không ghi dòng nào.
      </p>
      <a
        className="text-button"
        href={`/api/admin/${template}/template.xlsx`}
        download
      >
        Tải mẫu Excel
      </a>
      <Form
        label={title}
        onSubmit={async (d) => {
          const result = await api<{ rows: number }>(`/admin/${path}`, {
            method: "POST",
            body: d,
          });
          setMessage(`Đã nhập ${result.rows} dòng.`);
          await saved();
        }}
      >
        <label>
          File Excel
          <input type="file" name="file" accept=".xlsx" required />
        </label>
      </Form>
      {message && <p role="status">{message}</p>}
    </details>
  );
}

export default function Academic({ user, page }: { user: User; page: string }) {
  const manager = hasRole(user, "ADMIN", "EXAM_OFFICER");
  const [departments, setDepartments] = useState<Department[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [teachers, setTeachers] = useState<User[]>([]);
  const [students, setStudents] = useState<User[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [editing, setEditing] = useState<ClassRow | "new" | null>(null);
  const [department, setDepartment] = useState<Department | "new" | null>(null);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const load = useCallback(async () => {
    const [d, c, cl, t, s] = await Promise.all([
      api<Department[]>("/admin/departments"),
      api<Course[]>("/admin/courses"),
      api<ClassRow[]>("/admin/classes"),
      manager
        ? api<User[]>("/admin/examination/teachers")
        : Promise.resolve([]),
      manager ? api<User[]>("/admin/users") : Promise.resolve([]),
    ]);
    setDepartments(d);
    setCourses(c);
    setClasses(cl);
    setTeachers(t);
    setStudents(s.filter((u) => hasRole(u, "STUDENT")));
    setError("");
  }, [manager]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- State updates follow completed API requests.
    void load().catch((e) => setError(errorText(e)));
  }, [load]);
  if (selected && page === "classes")
    return (
      <ClassDetail
        key={selected}
        id={selected}
        user={user}
        students={students}
        back={() => {
          setSelected(null);
          void load().catch((e) => setError(errorText(e)));
        }}
      />
    );
  const current = editing && editing !== "new" ? editing : null;
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>
            {page === "departments"
              ? "Bộ môn"
              : manager
                ? "Quản lý lớp học"
                : "Lớp được phân công"}
          </h1>
          <p className="muted">
            {page === "departments"
              ? "Tổ chức các môn học theo bộ môn."
              : "Danh sách sinh viên, lịch thi và kết quả theo từng lớp."}
          </p>
        </div>
        {manager && (
          <button
            className="button"
            onClick={() =>
              page === "departments" ? setDepartment("new") : setEditing("new")
            }
          >
            {page === "departments" ? "Tạo bộ môn" : "Tạo lớp học"}
          </button>
        )}
      </div>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {page === "departments" ? (
        <>
          <div className="course-grid">
            {departments.map((d) => (
              <section className="panel" key={d.id}>
                <h2>
                  {d.code} · {d.name}
                </h2>
                <ul>
                  {courses
                    .filter((c) => c.department_id === d.id)
                    .map((c) => (
                      <li key={c.id}>
                        {c.code} · {c.name}
                      </li>
                    ))}
                </ul>
                {manager && (
                  <div className="inline">
                    <button
                      className="text-button"
                      onClick={() => setDepartment(d)}
                    >
                      Sửa bộ môn
                    </button>
                    <Action
                      className="text-button danger"
                      action={async () => {
                        if (window.confirm(`Xóa bộ môn ${d.name}?`)) {
                          await send(
                            `/admin/departments/${d.id}`,
                            undefined,
                            "DELETE",
                          );
                          await load();
                        }
                      }}
                    >
                      Xóa bộ môn
                    </Action>
                  </div>
                )}
              </section>
            ))}
          </div>
          {!departments.length && <Empty>Chưa có bộ môn.</Empty>}
          {manager && (
            <section className="panel">
              <h2>Gắn môn học vào bộ môn</h2>
              <Form
                onSubmit={async (d) => {
                  await send(
                    `/admin/courses/${d.get("course_id")}/department`,
                    { department_id: d.get("department_id") || null },
                    "PUT",
                  );
                  await load();
                }}
              >
                <div className="form-grid">
                  <label>
                    Môn học
                    <select name="course_id" aria-label="Môn học" required>
                      {courses.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.code} · {c.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Bộ môn
                    <select name="department_id" aria-label="Bộ môn">
                      <option value="">Chưa phân bộ môn</option>
                      {departments.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              </Form>
              <p className="muted">
                Chưa phân bộ môn:{" "}
                {courses
                  .filter((c) => !c.department_id)
                  .map((c) => c.code)
                  .join(", ") || "Không có"}
              </p>
            </section>
          )}
        </>
      ) : (
        <>
          {manager && (
            <ImportFile
              title="Nhập phân công giáo viên theo lớp"
              path="class-teachers/import"
              template="class-teachers"
              saved={load}
            />
          )}
          <label className="search">
            Tìm lớp
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Mã lớp, môn hoặc giảng viên"
            />
          </label>
          <div className="panel table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Lớp / Môn học</th>
                  <th>Giảng viên</th>
                  <th>Thời gian</th>
                  <th>Sĩ số</th>
                  <th>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {classes
                  .filter((c) =>
                    `${c.code} ${c.name} ${c.course_name} ${c.teacher_name || ""}`
                      .toLowerCase()
                      .includes(query.toLowerCase()),
                  )
                  .map((c) => (
                    <tr key={c.id}>
                      <td>
                        <button
                          className="text-button"
                          onClick={() => setSelected(c.id)}
                        >
                          {c.code} · {c.name}
                        </button>
                        <small className="muted block">{c.course_name}</small>
                      </td>
                      <td>{c.teacher_name || "Chưa phân công"}</td>
                      <td>
                        {date(c.starts_at)}
                        <br />
                        {date(c.ends_at)}
                      </td>
                      <td>{c.student_count}</td>
                      <td>
                        <div className="inline">
                          <button
                            className="text-button"
                            onClick={() => setSelected(c.id)}
                          >
                            Mở lớp
                          </button>
                          {manager && (
                            <>
                              <button
                                className="text-button"
                                onClick={() => setEditing(c)}
                              >
                                Sửa
                              </button>
                              <Action
                                className="text-button danger"
                                action={async () => {
                                  if (
                                    window.confirm(
                                      `Xóa lớp ${c.code} và danh sách sinh viên trong lớp?`,
                                    )
                                  ) {
                                    await send(
                                      `/admin/classes/${c.id}`,
                                      undefined,
                                      "DELETE",
                                    );
                                    await load();
                                  }
                                }}
                              >
                                Xóa
                              </Action>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
            {!classes.length && <Empty>Chưa có lớp học.</Empty>}
          </div>
        </>
      )}
      {department && (
        <Modal
          title={department === "new" ? "Tạo bộ môn" : "Sửa bộ môn"}
          close={() => setDepartment(null)}
        >
          <Form
            onSubmit={async (d) => {
              await send(
                `/admin/departments${department === "new" ? "" : `/${department.id}`}`,
                { code: d.get("code"), name: d.get("name") },
                department === "new" ? "POST" : "PUT",
              );
              setDepartment(null);
              await load();
            }}
          >
            <Field
              label="Mã bộ môn"
              name="code"
              defaultValue={department === "new" ? "" : department.code}
            />
            <Field
              label="Tên bộ môn"
              name="name"
              defaultValue={department === "new" ? "" : department.name}
            />
          </Form>
        </Modal>
      )}
      {editing && (
        <Modal
          title={current ? "Sửa lớp học" : "Tạo lớp học"}
          close={() => setEditing(null)}
        >
          <Form
            onSubmit={async (d) => {
              await send(
                `/admin/classes${current ? `/${current.id}` : ""}`,
                {
                  code: d.get("code"),
                  name: d.get("name"),
                  course_id: d.get("course_id"),
                  teacher_id: d.get("teacher_id") || null,
                  starts_at: stamp(d.get("starts_at")),
                  ends_at: stamp(d.get("ends_at")),
                },
                current ? "PUT" : "POST",
              );
              setEditing(null);
              await load();
            }}
          >
            <div className="form-grid">
              <Field label="Mã lớp" name="code" defaultValue={current?.code} />
              <Field label="Tên lớp" name="name" defaultValue={current?.name} />
              <label>
                Môn học
                <select
                  name="course_id"
                  required
                  defaultValue={current?.course_id}
                >
                  {courses.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.code} · {c.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Giảng viên phụ trách
                <select
                  aria-label="Giảng viên phụ trách"
                  name="teacher_id"
                  defaultValue={current?.teacher_id || ""}
                >
                  <option value="">Chưa phân công</option>
                  {teachers.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </label>
              <Field
                label="Bắt đầu lớp"
                name="starts_at"
                type="datetime-local"
                defaultValue={localDate(current?.starts_at)}
              />
              <Field
                label="Kết thúc lớp"
                name="ends_at"
                type="datetime-local"
                defaultValue={localDate(current?.ends_at)}
              />
            </div>
          </Form>
        </Modal>
      )}
    </>
  );
}

function ClassDetail({
  id,
  user,
  students,
  back,
}: {
  id: string;
  user: User;
  students: User[];
  back: () => void;
}) {
  const manager = hasRole(user, "ADMIN", "EXAM_OFFICER");
  const [data, setData] = useState<Detail | null>(null);
  const [error, setError] = useState("");
  const [round, setRound] = useState("");
  const [results, setResults] = useState<ResultRow[]>([]);
  const [review, setReview] = useState<Review | null>(null);
  const [tab, setTab] = useState("rounds");
  const load = useCallback(async () => {
    setData(await api<Detail>(`/admin/classes/${id}`));
  }, [id]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- State updates follow completed API requests.
    void load().catch((e) => setError(errorText(e)));
  }, [load]);
  useEffect(() => {
    if (!round) return;
    let active = true;
    const refresh = () =>
      api<ResultRow[]>(`/admin/classes/${id}/rounds/${round}/results`)
        .then((r) => {
          if (active) setResults(r);
        })
        .catch((e) => {
          if (active) setError(errorText(e));
        });
    void refresh();
    const timer = setInterval(() => void refresh(), 5000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [id, round]);
  const open = async (key: string) =>
    setReview(await api<Review>(`/admin/results/${key}`));
  if (review)
    return (
      <ReviewPage
        review={review}
        admin={hasRole(user, "ADMIN")}
        canGrade={hasRole(user, "ADMIN", "TEACHER")}
        back={() => setReview(null)}
        refresh={async () => open(review.id)}
        open={open}
      />
    );
  if (!data) return <Empty>{error || "Đang tải lớp…"}</Empty>;
  return (
    <>
      <button className="text-button" onClick={back}>
        ← Danh sách lớp
      </button>
      <div className="page-heading">
        <div>
          <h1>
            {data.code} · {data.name}
          </h1>
          <p>
            {data.course_name} ·{" "}
            {data.teacher_name || "Chưa phân công giáo viên"}
          </p>
          <small>
            {date(data.starts_at)} – {date(data.ends_at)}
          </small>
        </div>
      </div>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <div className="tabs">
        <button
          className={tab === "rounds" ? "active" : ""}
          onClick={() => setTab("rounds")}
        >
          Đợt thi & kết quả
        </button>
        <button
          className={tab === "students" ? "active" : ""}
          onClick={() => setTab("students")}
        >
          Sinh viên ({data.students.length})
        </button>
      </div>
      {tab === "students" ? (
        <>
          {manager && (
            <>
              <ImportFile
                title="Nhập sinh viên vào lớp"
                path={`classes/${id}/import-students`}
                template="class-students"
                saved={load}
              />
              <details className="panel">
                <summary>Thêm sinh viên đã có tài khoản</summary>
                <Form
                  label="Thêm vào lớp"
                  onSubmit={async (d) => {
                    await send(`/admin/classes/${id}/students`, {
                      student_ids: d.getAll("student_ids"),
                    });
                    await load();
                  }}
                >
                  <label>
                    Sinh viên (có thể chọn nhiều)
                    <select
                      name="student_ids"
                      aria-label="Sinh viên (có thể chọn nhiều)"
                      multiple
                      required
                      size={6}
                    >
                      {students
                        .filter(
                          (s) => !data.students.some((m) => m.id === s.id),
                        )
                        .map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name} · {s.email || s.username}
                          </option>
                        ))}
                    </select>
                  </label>
                </Form>
              </details>
            </>
          )}
          <p className="muted">
            Thay đổi danh sách lớp áp dụng cho các đợt thi tạo sau đó. Các đợt
            đã tạo giữ nguyên danh sách và kết quả.
          </p>
          <div className="panel table-wrap">
            <table>
              <thead>
                <tr>
                  <th>MSSV</th>
                  <th>Sinh viên</th>
                  <th>Email</th>
                  {manager && <th />}
                </tr>
              </thead>
              <tbody>
                {data.students.map((s) => (
                  <tr key={s.id}>
                    <td>{s.student_number || "—"}</td>
                    <td>{s.name}</td>
                    <td>{s.email}</td>
                    {manager && (
                      <td>
                        <Action
                          className="text-button danger"
                          action={async () => {
                            if (
                              window.confirm(`Gỡ ${s.name} khỏi danh sách lớp?`)
                            ) {
                              await send(
                                `/admin/classes/${id}/students/${s.id}`,
                                undefined,
                                "DELETE",
                              );
                              await load();
                            }
                          }}
                        >
                          Gỡ khỏi lớp
                        </Action>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <>
          {manager && (
            <details className="panel">
              <summary>Tạo đợt thi từ ngân hàng đề</summary>
              <p>
                Chọn đề đã công bố. Đợt thi lưu bản sao câu hỏi/rubric, lịch và
                danh sách sinh viên hiện tại.
              </p>
              {!data.bank.length ? (
                <Empty>
                  Chưa có đề đã công bố trong ngân hàng của môn học.
                </Empty>
              ) : (
                <Form
                  label="Tạo đợt thi"
                  onSubmit={async (d) => {
                    await send(`/admin/classes/${id}/rounds`, {
                      name: d.get("name"),
                      exam_id: d.get("exam_id"),
                      opens_at: stamp(d.get("opens_at")),
                      closes_at: stamp(d.get("closes_at")),
                    });
                    await load();
                  }}
                >
                  <div className="form-grid">
                    <Field label="Tên đợt thi" name="name" />
                    <label>
                      Đề từ ngân hàng
                      <select
                        name="exam_id"
                        aria-label="Đề từ ngân hàng"
                        required
                      >
                        {data.bank.map((e) => (
                          <option key={e.id} value={e.id}>
                            {e.name} · {e.category || "Chưa phân loại"} ·{" "}
                            {e.rubric_name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <Field
                      label="Mở thi"
                      name="opens_at"
                      type="datetime-local"
                    />
                    <Field
                      label="Đóng thi"
                      name="closes_at"
                      type="datetime-local"
                    />
                  </div>
                </Form>
              )}
            </details>
          )}
          <label>
            Chọn đợt thi
            <select
              aria-label="Chọn đợt thi"
              value={round}
              onChange={(e) => {
                setRound(e.target.value);
                setResults([]);
              }}
            >
              <option value="">Chọn đợt thi để xem điểm</option>
              {data.rounds.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name} · {date(r.opens_at)} – {date(r.closes_at)}
                </option>
              ))}
            </select>
          </label>
          {!data.rounds.length && <Empty>Chưa có đợt thi.</Empty>}
          {round && (
            <section className="panel table-wrap">
              <h2>Bài thi của lớp</h2>
              <table>
                <thead>
                  <tr>
                    <th>Sinh viên</th>
                    <th>Lần thi</th>
                    <th>Trạng thái</th>
                    <th>Điểm</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {results.flatMap((r) =>
                    r.sessions.length
                      ? r.sessions.map((s) => (
                          <tr key={s.id}>
                            <td>
                              {r.student_number} · {r.student_name}
                            </td>
                            <td>{s.attempt_number}</td>
                            <td>
                              <Badge status={s.status} />
                            </td>
                            <td>{s.final_score ?? "Chưa xác nhận"}</td>
                            <td>
                              <Action
                                className="text-button"
                                action={() => open(s.id)}
                              >
                                Xem bài / chấm lại
                              </Action>
                            </td>
                          </tr>
                        ))
                      : [
                          <tr key={r.student_id}>
                            <td>{r.student_name}</td>
                            <td>—</td>
                            <td>
                              <Badge status="NOT_TAKEN" />
                            </td>
                            <td>—</td>
                            <td />
                          </tr>,
                        ],
                  )}
                </tbody>
              </table>
            </section>
          )}
        </>
      )}
    </>
  );
}
