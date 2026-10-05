"use client";
import { useCallback, useEffect, useState } from "react";
import { api, send, errorText, Course, User } from "./api";
import { Action, Badge, Empty, Field, Form } from "./shared";
import ExamDraftReview from "./exam-draft-review";

type ExamRow = {
  id: string;
  name: string;
  status: string;
  course_id: string;
  course_name: string;
  teacher_id: string;
  time_limit: number;
};
type Candidate = {
  student_id: string;
  student_number: string;
  name: string;
  email: string;
  opens_at: number | null;
  closes_at: number | null;
};
type Teacher = { id: string; name: string };
const date = (value: number | null) =>
  value ? new Date(value * 1000).toLocaleString("vi-VN") : "Chưa xếp lịch";

export default function Examination({
  user,
  navigate,
}: {
  user: User;
  navigate: (page: string) => void;
}) {
  const [exams, setExams] = useState<ExamRow[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState("");
  const officer = ["ADMIN", "EXAM_OFFICER"].includes(user.role);
  const load = useCallback(async () => {
    const [list, c, t] = await Promise.all([
      api<ExamRow[]>("/admin/examination/exams"),
      api<Course[]>("/admin/courses"),
      officer
        ? api<Teacher[]>("/admin/examination/teachers")
        : Promise.resolve([]),
    ]);
    setExams(list);
    setCourses(c);
    setTeachers(t);
  }, [officer]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Updates follow completed API requests.
    void load().catch((e) => setError(errorText(e)));
  }, [load]);
  const exam = exams.find((e) => e.id === selected);
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Điều phối kỳ thi</h1>
          <p>
            Giao giảng viên → nhập danh sách → duyệt đề → xếp lịch → mở thi →
            xuất điểm.
          </p>
        </div>
      </div>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {exam ? (
        <>
          <button className="text-button" onClick={() => setSelected(null)}>
            ← Tất cả kỳ thi
          </button>
          <ExamOperations
            key={exam.id}
            exam={exam}
            officer={officer}
            editable={["ADMIN", "TEACHER"].includes(user.role)}
            refresh={load}
            navigate={navigate}
          />
        </>
      ) : (
        <>
          {officer && (
            <section className="panel">
              <h2>Tạo kỳ thi & giao giảng viên</h2>
              <p>
                Mỗi môn có một giảng viên phụ trách. Phân công ở đây áp dụng cho
                toàn bộ đề và bài chấm của môn đó.
              </p>
              {!teachers.length && (
                <p>
                  Admin cần cấp role TEACHER cho giảng viên trong Người dùng.
                </p>
              )}
              <Form
                label="Tạo kỳ thi"
                onSubmit={async (d) => {
                  const created = await send<{ id: string }>(
                    "/admin/examination/exams",
                    {
                      course_id: d.get("course_id"),
                      teacher_id: d.get("teacher_id"),
                      name: d.get("name"),
                      time_limit: Number(d.get("minutes")) * 60,
                    },
                  );
                  await load();
                  setSelected(created.id);
                }}
              >
                <Field label="Tên kỳ thi" name="name" />
                <label>
                  Môn học
                  <select name="course_id" required defaultValue="">
                    <option value="" disabled>
                      Chọn môn học
                    </option>
                    {courses
                      .filter((c) => c.status === "ACTIVE")
                      .map((c) => (
                        <option value={c.id} key={c.id}>
                          {c.code} · {c.name}
                        </option>
                      ))}
                  </select>
                </label>
                <label>
                  Giảng viên
                  <select name="teacher_id" required defaultValue="">
                    <option value="" disabled>
                      Chọn giảng viên
                    </option>
                    {teachers.map((t) => (
                      <option value={t.id} key={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </label>
                <Field
                  label="Thời lượng (phút)"
                  name="minutes"
                  type="number"
                  min={1}
                  max={180}
                  defaultValue={15}
                />
              </Form>
            </section>
          )}
          <div className="course-grid">
            {exams.map((e) => (
              <section className="panel" key={e.id}>
                <Badge status={e.status} />
                <h2>{e.name}</h2>
                <p>{e.course_name}</p>
                <button className="button" onClick={() => setSelected(e.id)}>
                  Mở kỳ thi
                </button>
              </section>
            ))}
          </div>
          {!exams.length && <Empty>Chưa có kỳ thi được giao.</Empty>}
        </>
      )}
    </>
  );
}

function ExamOperations({
  exam,
  officer,
  editable,
  refresh,
  navigate,
}: {
  exam: ExamRow;
  officer: boolean;
  editable: boolean;
  refresh: () => Promise<unknown>;
  navigate: (page: string) => void;
}) {
  const [roster, setRoster] = useState<Candidate[]>([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const loadRoster = useCallback(async () => {
    setRoster(await api<Candidate[]>(`/admin/exams/${exam.id}/roster`));
  }, [exam.id]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Updates follow completed API requests.
    void loadRoster().catch((e) => setError(errorText(e)));
  }, [loadRoster]);
  return (
    <>
      <section className="panel">
        <h2>{exam.name}</h2>
        <p>
          {exam.course_name} · {exam.time_limit / 60} phút
        </p>
        <Badge status={exam.status} />
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        {editable && exam.status === "DRAFT" && (
          <>
            <p>
              Mở môn học để sửa bản nháp: chủ đề, số câu hỏi và độ khó cho từng
              nhóm câu. Đặt số lượng = 1 để cấu hình từng câu.
            </p>
            <button
              className="button secondary"
              onClick={() => navigate("courses")}
            >
              Cấu hình đề trong môn học
            </button>
            <Action
              action={async () => {
                await send(`/admin/exams/${exam.id}/generate`);
                await refresh();
              }}
            >
              Sinh câu hỏi & rubric
            </Action>
          </>
        )}
        {["GENERATED", "TEACHER_APPROVED", "PUBLISHED"].includes(
          exam.status,
        ) && (
          <ExamDraftReview
            key={`${exam.id}-${exam.status}`}
            examId={exam.id}
            editable={editable}
            refresh={refresh}
          />
        )}
        {(officer || editable) &&
          ["GENERATED", "TEACHER_APPROVED"].includes(exam.status) && (
            <details>
              <summary>Trả về bản nháp để sửa cấu hình</summary>
              <Form
                label="Trả về bản nháp"
                onSubmit={async (d) => {
                  await send(`/admin/exams/${exam.id}/return-draft`, {
                    reason: d.get("reason"),
                  });
                  await refresh();
                }}
              >
                <Field label="Lý do" name="reason" />
              </Form>
            </details>
          )}
      </section>
      <section className="panel">
        <h2>Danh sách sinh viên ({roster.length})</h2>
        {officer && (
          <>
            <a
              className="button secondary"
              href="/api/admin/examination/template.xlsx"
              download
            >
              Tải template Excel
            </a>
            <a
              className="button secondary"
              href={`/api/admin/exams/${exam.id}/grades.xlsx`}
              download
            >
              Xuất điểm Excel
            </a>
          </>
        )}
        {officer && exam.status !== "PUBLISHED" && (
          <>
            <p>
              Nhập .xlsx tối đa 5000 sinh viên. Mật khẩu ban đầu tùy chọn: điền
              tối thiểu 12 ký tự để đăng nhập email/mật khẩu; để trống nếu dùng
              Google với email đã nhập. Tài khoản có sẵn giữ nguyên mật khẩu.
            </p>
            <Form
              label="Nhập danh sách Excel"
              onSubmit={async (d) => {
                const result = await api<{
                  added: number;
                  accounts_created: number;
                }>(`/admin/exams/${exam.id}/import-students`, {
                  method: "POST",
                  body: d,
                });
                setMessage(
                  `Đã thêm ${result.added} sinh viên, tạo ${result.accounts_created} tài khoản.`,
                );
                await loadRoster();
              }}
            >
              <label>
                File danh sách
                <input type="file" name="file" accept=".xlsx" required />
              </label>
            </Form>
          </>
        )}
        {message && <p role="status">{message}</p>}
        {!!roster.length && (
          <>
            <label>
              <input
                type="checkbox"
                checked={selected.length === roster.length}
                onChange={(e) =>
                  setSelected(
                    e.target.checked ? roster.map((r) => r.student_id) : [],
                  )
                }
              />
              Chọn tất cả
            </label>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Chọn</th>
                    <th>MSSV</th>
                    <th>Sinh viên</th>
                    <th>Email</th>
                    <th>Mở vào thi</th>
                    <th>Đóng vào thi</th>
                  </tr>
                </thead>
                <tbody>
                  {roster.map((r) => (
                    <tr key={r.student_id}>
                      <td>
                        <input
                          type="checkbox"
                          aria-label={`Chọn ${r.name}`}
                          checked={selected.includes(r.student_id)}
                          onChange={(e) =>
                            setSelected(
                              e.target.checked
                                ? [...selected, r.student_id]
                                : selected.filter((id) => id !== r.student_id),
                            )
                          }
                        />
                      </td>
                      <td>{r.student_number}</td>
                      <td>{r.name}</td>
                      <td>{r.email}</td>
                      <td>{date(r.opens_at)}</td>
                      <td>{date(r.closes_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
        {officer && exam.status === "TEACHER_APPROVED" && (
          <>
            <h3>Xếp lịch cho {selected.length} sinh viên đã chọn</h3>
            <p>
              Giờ hiển thị theo múi giờ của máy. Sinh viên được bắt đầu trong
              khoảng này và có đủ thời lượng bài thi kể từ lúc bắt đầu.
            </p>
            <Form
              label="Lưu lịch thi"
              onSubmit={async (d) => {
                if (!selected.length)
                  throw new Error("Chọn ít nhất một sinh viên");
                await send(
                  `/admin/exams/${exam.id}/schedule`,
                  {
                    student_ids: selected,
                    opens_at:
                      new Date(String(d.get("opens_at"))).getTime() / 1000,
                    closes_at:
                      new Date(String(d.get("closes_at"))).getTime() / 1000,
                  },
                  "PUT",
                );
                await loadRoster();
                setMessage("Đã lưu lịch thi.");
              }}
            >
              <Field
                label="Giờ mở vào thi"
                name="opens_at"
                type="datetime-local"
              />
              <Field
                label="Giờ đóng vào thi"
                name="closes_at"
                type="datetime-local"
              />
            </Form>
            <Action
              action={async () => {
                await send(`/admin/exams/${exam.id}/office-approve`);
                await refresh();
              }}
            >
              Xác nhận đã kiểm tra đề & mở kỳ thi
            </Action>
          </>
        )}
      </section>
    </>
  );
}
