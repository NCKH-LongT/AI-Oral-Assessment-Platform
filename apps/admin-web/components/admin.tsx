"use client";
import {
  AttemptLimitFields,
  AttemptPolicy,
  ResultActions,
} from "./exam-retakes";
import { useCallback, useEffect, useState } from "react";
import {
  ArrowLeft,
  ArrowUpRight,
  BookOpen,
  FileText,
  GraduationCap,
  Plus,
  Search,
  Users,
  ClipboardList,
} from "lucide-react";
import {
  api,
  send,
  errorText,
  Course,
  Workspace,
  User,
  Result,
  Review,
  Criterion,
  Blueprint,
  Chunk,
  Rubric,
  Exam,
} from "./api";
import { Action, Badge, Empty, Field, Form, Modal } from "./shared";
import { TextbookPanel, TopicPanel } from "./knowledge";
import PlatformSettings from "./platform-settings";
import CourseStudents from "./course-students";
import { TranscriptionReview } from "./transcription-review";

export default function Admin({
  user,
  page,
  navigate,
}: {
  user: User;
  page: string;
  navigate: (page: string) => void;
}) {
  const [courses, setCourses] = useState<Course[]>([]),
    [users, setUsers] = useState<User[]>([]),
    [results, setResults] = useState<Result[]>([]);
  const [stats, setStats] = useState({
      courses: 0,
      documents: 0,
      exams: 0,
      sessions: 0,
      ai_provider: "",
    }),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Course | null>(null),
    [review, setReview] = useState<Review | null>(null),
    [query, setQuery] = useState(""),
    [showCreate, setShowCreate] = useState(false);
  const editable = user.role === "ADMIN" || user.role === "TEACHER";
  const load = useCallback(async () => {
    try {
      const [c, u, r, s] = await Promise.all([
        api<Course[]>("/admin/courses"),
        api<User[]>("/admin/users"),
        api<Result[]>("/admin/results"),
        api<typeof stats>("/admin/dashboard"),
      ]);
      setCourses(c);
      setUsers(u);
      setResults(r);
      setStats(s);
      setError("");
    } catch (e) {
      setError(errorText(e));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- State updates follow an asynchronous API response.
    void load();
  }, [load]);
  useEffect(() => {
    if (page !== "results") return;
    const timer = setInterval(() => {
      void load();
      if (review)
        api<Review>(`/admin/results/${review.id}`)
          .then(setReview)
          .catch(() => {});
    }, 5000);
    return () => clearInterval(timer);
  }, [page, load, review?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (loading) return <Empty>Đang tải dữ liệu…</Empty>;
  if (page === "settings" && user.role === "ADMIN") return <PlatformSettings />;
  if (selected && page === "courses")
    return (
      <CourseWorkspace
        course={selected}
        students={users}
        admin={user.role === "ADMIN"}
        editable={editable}
        back={() => {
          setSelected(null);

          void load();
        }}
      />
    );
  if (review && page === "results")
    return (
      <ReviewPage
        review={review}
        admin={user.role === "ADMIN"}
        refresh={async () =>
          setReview(await api<Review>(`/admin/results/${review.id}`))
        }
        back={() => {
          setReview(null);
          void load();
        }}
        open={async (id) =>
          setReview(await api<Review>(`/admin/results/${id}`))
        }
      />
    );
  return (
    <>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {page === "dashboard" && (
        <>
          <div className="page-heading">
            <div>
              <span className="eyebrow">KHÔNG GIAN ĐÁNH GIÁ</span>
              <h1>Chào {user.name.split(" ").at(-1)},</h1>
              <p className="muted">
                Mọi thứ bạn cần để tổ chức một kỳ thi vấn đáp có căn cứ.
              </p>
            </div>
            <button className="button" onClick={() => navigate("courses")}>
              Quản lý môn học <ArrowUpRight size={17} />
            </button>
          </div>
          {stats.ai_provider === "demo" && (
            <div className="notice">
              <strong>Đang dùng chế độ demo</strong>
              <span>
                Có thể thử toàn bộ quy trình. Chưa có điểm AI chính thức; bài
                nộp được chuyển cho giảng viên xem lại.
              </span>
            </div>
          )}
          <div className="stats">
            {[
              { label: "Môn học", value: stats.courses, icon: BookOpen },
              {
                label: "Tài liệu kiến thức",
                value: stats.documents,
                icon: FileText,
              },
              { label: "Bài thi", value: stats.exams, icon: ClipboardList },
              { label: "Lượt thi", value: stats.sessions, icon: GraduationCap },
            ].map((s) => (
              <div className="stat" key={s.label}>
                <div>
                  <span>{s.label}</span>
                  <s.icon size={20} />
                </div>
                <strong>{s.value.toString().padStart(2, "0")}</strong>
                <small>Dữ liệu trong phạm vi quản lý</small>
              </div>
            ))}
          </div>
          <div className="dashboard-grid">
            <section className="panel">
              <div className="section-title">
                <h2>Môn học của bạn</h2>
                <button
                  className="text-button"
                  onClick={() => navigate("courses")}
                >
                  Xem tất cả →
                </button>
              </div>
              {!courses.length ? (
                <Empty>Bắt đầu bằng cách tạo môn học đầu tiên.</Empty>
              ) : (
                courses.slice(0, 4).map((c) => (
                  <button
                    className="course-row"
                    key={c.id}
                    onClick={() => navigate("courses")}
                  >
                    <span className="course-icon">
                      <BookOpen size={22} />
                    </span>
                    <div>
                      <strong>{c.name}</strong>
                      <small>{c.code}</small>
                    </div>
                    <Badge status={c.status} />
                    <ArrowUpRight size={18} />
                  </button>
                ))
              )}
            </section>
            <section className="guide-card">
              <span className="eyebrow">QUY TRÌNH GIAI ĐOẠN 1</span>
              <h2>
                Từ tài liệu
                <br />
                đến đánh giá.
              </h2>
              {[
                "Tạo môn học, chuẩn đầu ra & chủ đề",
                "Tải tài liệu và thiết lập rubric",
                "Tạo blueprint, công bố & giao bài",
                "Sinh viên trả lời, AI hỗ trợ chấm",
                "Xem lại transcript và minh chứng",
              ].map((s, i) => (
                <div className="step" key={s}>
                  <span>{i + 1}</span>
                  {s}
                </div>
              ))}
            </section>
          </div>
          <section className="panel">
            <div className="section-title">
              <h2>Lượt thi gần đây</h2>
              <button
                className="text-button"
                onClick={() => navigate("results")}
              >
                Xem kết quả →
              </button>
            </div>
            <ResultTable
              rows={results.slice(0, 5)}
              open={async () => navigate("results")}
            />
          </section>
        </>
      )}
      {page === "courses" && (
        <>
          <div className="page-heading">
            <div>
              <span className="eyebrow">THIẾT KẾ VIỆC ĐÁNH GIÁ</span>
              <h1>Môn học & đề thi</h1>
              <p className="muted">
                Tổ chức kiến thức, tiêu chí và bài thi trong từng môn học.
              </p>
            </div>
            {editable && (
              <button
                className="button"
                onClick={() => setShowCreate(!showCreate)}
              >
                <Plus size={17} />
                Tạo môn học
              </button>
            )}
          </div>
          {showCreate && (
            <section className="panel">
              <h2>Môn học mới</h2>
              <Form
                label="Tạo môn học"
                onSubmit={async (d) => {
                  await send("/admin/courses", {
                    code: d.get("code"),
                    name: d.get("name"),
                    description: d.get("description"),
                  });
                  setShowCreate(false);
                  await load();
                }}
              >
                <div className="form-grid">
                  <Field label="Mã môn học" name="code" placeholder="SE101" />
                  <Field
                    label="Tên môn học"
                    name="name"
                    placeholder="Nhập môn Công nghệ phần mềm"
                  />
                </div>
                <Field label="Mô tả" name="description" required={false} />
              </Form>
            </section>
          )}
          <div className="search">
            <Search size={18} />
            <input
              aria-label="Tìm môn học"
              placeholder="Tìm theo tên hoặc mã môn học…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <span>{courses.length} môn học</span>
          </div>
          <div className="course-grid">
            {courses
              .filter((c) =>
                (c.name + " " + c.code)
                  .toLowerCase()
                  .includes(query.toLowerCase()),
              )
              .map((c) => (
                <button
                  className="course-card"
                  key={c.id}
                  onClick={() => setSelected(c)}
                >
                  <div>
                    <span className="course-icon">
                      <BookOpen />
                    </span>
                    <Badge status={c.status} />
                  </div>
                  <small>{c.code}</small>
                  <h2>{c.name}</h2>
                  <p>
                    {c.description ||
                      "Thêm tài liệu và cấu hình bài thi cho môn học này."}
                  </p>
                  <div className="card-bottom">
                    Mở không gian môn học
                    <ArrowUpRight size={18} />
                  </div>
                </button>
              ))}
          </div>
          {!courses.length && (
            <Empty>Chưa có môn học. Tạo môn học để bắt đầu.</Empty>
          )}
        </>
      )}
      {page === "users" && (
        <>
          <div className="page-heading">
            <div>
              <span className="eyebrow">CON NGƯỜI & VAI TRÒ</span>
              <h1>Người dùng</h1>
              <p className="muted">
                Tài khoản được quản trị viên cấp trước khi giao bài thi.
              </p>
            </div>
            {user.role === "ADMIN" && (
              <button
                className="button"
                onClick={() => setShowCreate(!showCreate)}
              >
                <Plus size={17} />
                Tạo tài khoản
              </button>
            )}
          </div>
          {showCreate && (
            <section className="panel">
              <Form
                label="Tạo tài khoản"
                onSubmit={async (d) => {
                  await send("/admin/users", {
                    username: d.get("username"),
                    name: d.get("name"),
                    password: d.get("password"),
                    role: d.get("role"),
                  });
                  setShowCreate(false);
                  await load();
                }}
              >
                <div className="form-grid">
                  <Field label="Họ và tên" name="name" />
                  <Field label="Tên đăng nhập" name="username" />
                  <label>
                    Mật khẩu (tối thiểu 12 ký tự)
                    <input
                      name="password"
                      type="password"
                      minLength={12}
                      required
                    />
                  </label>
                  <label>
                    Vai trò
                    <select name="role">
                      <option value="STUDENT">Sinh viên</option>
                      <option value="TEACHER">Giảng viên</option>
                      <option value="REVIEWER">Người duyệt</option>
                      <option value="ADMIN">Quản trị viên</option>
                    </select>
                  </label>
                </div>
              </Form>
            </section>
          )}
          <section className="panel table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Người dùng</th>
                  <th>Email / Tên đăng nhập</th>
                  <th>Vai trò</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id}>
                    <td>
                      <span className="user-cell">
                        <span className="avatar">
                          <Users size={16} />
                        </span>
                        {u.name}
                      </span>
                    </td>
                    <td>{u.email || u.username}</td>
                    <td>
                      <span className="pill">{u.role}</span>
                      {user.role === "ADMIN" && (
                        <RoleEditor
                          user={u}
                          saved={async () => {
                            await load();
                            if (u.id === user.id) window.location.reload();
                          }}
                        />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </>
      )}
      {page === "results" && (
        <>
          <div className="page-heading">
            <div>
              <span className="eyebrow">MINH BẠCH TRONG ĐÁNH GIÁ</span>
              <h1>Kết quả & xem lại</h1>
              <p className="muted">
                Kiểm tra câu trả lời, điểm theo tiêu chí và minh chứng gốc.
              </p>
            </div>
            <Action className="button secondary" action={load}>
              Làm mới
            </Action>
          </div>
          <section className="panel">
            <ResultTable
              rows={results}
              admin={user.role === "ADMIN"}
              refresh={load}
              open={async (id) =>
                setReview(await api<Review>(`/admin/results/${id}`))
              }
            />
          </section>
        </>
      )}
    </>
  );
}
function ResultTable({
  rows,
  open,
  admin = false,
  refresh = async () => {},
}: {
  rows: Result[];
  open: (id: string) => Promise<unknown>;
  admin?: boolean;
  refresh?: () => Promise<unknown>;
}) {
  return !rows.length ? (
    <Empty>
      Chưa có lượt thi. Kết quả sẽ xuất hiện khi sinh viên bắt đầu bài.
    </Empty>
  ) : (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Sinh viên</th>
            <th>Bài thi</th>
            <th>Lần thi</th>
            <th>Thời gian</th>
            <th>Trạng thái</th>
            <th>Điểm chính thức</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td>
                <strong>{r.student_name}</strong>
              </td>
              <td>{r.exam_name}</td>
              <td>Lần {r.attempt_number ?? 1}</td>
              <td>
                {r.created_at
                  ? new Date(r.created_at * 1000).toLocaleString("vi-VN")
                  : "—"}
              </td>
              <td>
                <Badge status={r.status} />
              </td>
              <td>
                {r.final_score === null
                  ? "Chưa xác nhận"
                  : `${r.final_score}/10`}
              </td>
              <td>
                <Action className="text-button" action={() => open(r.id)}>
                  Xem bài →
                </Action>
                {admin && (
                  <ResultActions
                    result={r}
                    refresh={refresh}
                    deleted={refresh}
                  />
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CourseWorkspace({
  admin,
  course,
  students,
  editable,
  back,
}: {
  admin: boolean;
  course: Course;
  students: User[];
  editable: boolean;
  back: () => void;
}) {
  const [data, setData] = useState<Workspace | null>(null),
    [tab, setTab] = useState("knowledge"),
    [knowledgeTab, setKnowledgeTab] = useState("textbook"),
    [rubricOpen, setRubricOpen] = useState(false),
    [examOpen, setExamOpen] = useState(false),
    [error, setError] = useState(""),
    [rag, setRag] = useState<Chunk[] | null>(null);
  const [editRubric, setEditRubric] = useState<Rubric | null>(null),
    [editExam, setEditExam] = useState<Exam | null>(null),
    [formVersion, setFormVersion] = useState(0);
  const load = useCallback(async () => {
    const workspace = await api<Workspace>(
      `/admin/courses/${course.id}/workspace`,
    );
    setData(workspace);
  }, [course.id]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- State updates follow an asynchronous API response.
    load().catch((e) => setError(errorText(e)));
    const timer = setInterval(() => load().catch(() => {}), 5000);
    return () => clearInterval(timer);
  }, [load]);
  const mutate = async (path: string, body?: unknown, method = "POST") => {
    await send(path, body, method);
    await load();
  };
  if (!data) return <Empty>{error || "Đang tải môn học…"}</Empty>;
  return (
    <>
      <button className="text-button back" onClick={back}>
        <ArrowLeft size={16} />
        Tất cả môn học
      </button>
      <div className="page-heading">
        <div>
          <span className="eyebrow">{course.code}</span>
          <h1>{course.name}</h1>
          <p className="muted">{course.description}</p>
        </div>
        <Badge status={course.status} />
      </div>
      <div className="tabs">
        {[
          { id: "knowledge", label: "01 · Kiến thức" },
          { id: "rubric", label: "02 · Rubric" },
          { id: "exams", label: "03 · Bài thi & giao bài" },
          { id: "students", label: "04 · Học viên" },
          { id: "settings", label: "Cài đặt" },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={tab === t.id ? "active" : ""}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === "students" && (
        <CourseStudents courseId={course.id} users={students} admin={admin} />
      )}
      {tab === "knowledge" && (
        <>
          <div className="tabs sub-tabs">
            {[
              ["textbook", "Giáo trình"],
              ["outcomes", "Chuẩn đầu ra"],
              ["topics", "Chủ đề"],
              ["documents", "Tài liệu bổ sung"],
              ["rag", "Tra cứu kiến thức"],
            ].map(([id, label]) => (
              <button
                key={id}
                className={knowledgeTab === id ? "active" : ""}
                onClick={() => setKnowledgeTab(id)}
              >
                {label}
              </button>
            ))}
          </div>
          {knowledgeTab === "textbook" && (
            <TextbookPanel
              courseId={course.id}
              data={data}
              editable={editable}
              reload={load}
            />
          )}
          {knowledgeTab === "outcomes" && (
            <section className="panel">
              <h2>Chuẩn đầu ra (LO)</h2>
              {data.outcomes.map((lo) => (
                <div key={lo.id} className="list-item">
                  <div>
                    <strong>{lo.code}</strong>
                    <p>{lo.description}</p>
                  </div>
                  {editable && (
                    <Action
                      className="text-button danger"
                      action={() =>
                        mutate(`/admin/outcomes/${lo.id}`, undefined, "DELETE")
                      }
                    >
                      Xóa
                    </Action>
                  )}
                </div>
              ))}
              {editable && (
                <Form
                  label="Thêm chuẩn đầu ra"
                  onSubmit={(d) =>
                    mutate(`/admin/courses/${course.id}/outcomes`, {
                      code: d.get("code"),
                      description: d.get("description"),
                      weight: Number(d.get("weight")),
                    })
                  }
                >
                  <Field label="Mã LO" name="code" placeholder="LO1" />
                  <Field label="Mô tả chuẩn đầu ra" name="description" />
                  <Field
                    label="Trọng số LO"
                    name="weight"
                    type="number"
                    min={1}
                    max={100}
                    defaultValue={1}
                  />
                </Form>
              )}
            </section>
          )}
          {knowledgeTab === "topics" && (
            <TopicPanel
              courseId={course.id}
              data={data}
              editable={editable}
              reload={load}
            />
          )}
          {knowledgeTab === "documents" && (
            <section className="panel">
              <div className="section-title">
                <h2>Tài liệu môn học</h2>
                <span className="muted">PDF · PPTX · DOCX · TXT</span>
              </div>
              <p className="muted">
                Tài liệu được tách nội dung và tạo embedding. Chờ trạng thái
                “Sẵn sàng” trước khi công bố đề.
              </p>
              {editable && (
                <Form
                  label="Tải tài liệu lên"
                  onSubmit={async (d) => {
                    if (!d.get("topic_id")) d.delete("topic_id");
                    await api(`/admin/courses/${course.id}/documents`, {
                      method: "POST",
                      body: d,
                    });
                    await load();
                  }}
                >
                  <div className="form-grid">
                    <label>
                      Chủ đề
                      <select name="topic_id">
                        <option value="">
                          Lưu vào môn học, gắn chủ đề sau
                        </option>
                        {data.topics.map((t) => (
                          <option value={t.id} key={t.id}>
                            {t.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Tài liệu (tối đa 20 MB)
                      <input
                        type="file"
                        name="file"
                        required
                        accept=".pdf,.pptx,.docx,.txt"
                      />
                    </label>
                  </div>
                </Form>
              )}
              {data.documents.map((d) => (
                <div className="list-item" key={d.id}>
                  <FileText size={20} />
                  <div className="grow">
                    <strong>{d.filename}</strong>
                    {d.error && <p className="error">{d.error}</p>}
                  </div>
                  <Badge status={d.status} />
                  {d.status === "FAILED" && editable && (
                    <Action
                      className="text-button"
                      action={() => mutate(`/admin/documents/${d.id}/retry`)}
                    >
                      Thử lại
                    </Action>
                  )}
                </div>
              ))}
            </section>
          )}
          {knowledgeTab === "rag" && (
            <section className="panel">
              <h2>Kiểm tra truy xuất RAG</h2>
              <Form
                label="Tìm trong tài liệu"
                onSubmit={async (d) =>
                  setRag(
                    await api<Chunk[]>(
                      `/admin/courses/${course.id}/rag?topic_id=${d.get("topic_id")}&q=${encodeURIComponent(String(d.get("q")))}`,
                    ),
                  )
                }
              >
                <div className="form-grid">
                  <label>
                    Chủ đề
                    <select name="topic_id" required>
                      {data.topics.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <Field name="q" label="Nội dung cần tìm" />
                </div>
              </Form>
              {rag?.map((c) => (
                <blockquote key={c.id}>
                  <small>
                    Trang/slide {c.page} · {c.id.slice(0, 8)}
                  </small>
                  <p>{c.content}</p>
                </blockquote>
              ))}
              {rag?.length === 0 && (
                <Empty>
                  Không có nội dung phù hợp. Kiểm tra tài liệu và chủ đề.
                </Empty>
              )}
            </section>
          )}
        </>
      )}
      {tab === "rubric" && (
        <>
          <div className="notice">
            <strong>Thang điểm quy đổi về 10</strong>
            <span>
              Mỗi tiêu chí có điểm tối đa và trọng số. Đề đã công bố giữ nguyên
              phiên bản rubric tại thời điểm công bố.
            </span>
          </div>
          {editable && (
            <button
              className="button"
              onClick={() => {
                setEditRubric(null);
                setRubricOpen(true);
              }}
            >
              Tạo rubric
            </button>
          )}
          {data.rubrics.map((r) => (
            <section className="panel" key={r.id}>
              <div className="section-title">
                <h2>
                  {r.name} <span className="pill">v{r.version}</span>
                </h2>
                {editable && (
                  <div className="inline">
                    <button
                      className="text-button"
                      aria-label={`Sửa rubric ${r.name}`}
                      onClick={() => {
                        setEditRubric(r);
                        setRubricOpen(true);
                      }}
                    >
                      Sửa
                    </button>
                    <Action
                      className="text-button danger"
                      action={async () => {
                        if (!window.confirm(`Xóa rubric “${r.name}”?`)) return;
                        await mutate(
                          `/admin/rubrics/${r.id}`,
                          undefined,
                          "DELETE",
                        );
                        if (editRubric?.id === r.id) setEditRubric(null);
                      }}
                    >
                      Xóa
                    </Action>
                  </div>
                )}
              </div>
              <details>
                <summary>Xem tiêu chí</summary>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Tiêu chí</th>
                        <th>Mô tả</th>
                        <th>Điểm tối đa</th>
                        <th>Trọng số</th>
                      </tr>
                    </thead>
                    <tbody>
                      {r.criteria.map((c) => (
                        <tr key={c.name}>
                          <td>{c.name}</td>
                          <td>{c.description}</td>
                          <td>{c.max_score}</td>
                          <td>{c.weight}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            </section>
          ))}
          {editable && rubricOpen && (
            <Modal
              title="Thiết lập rubric"
              close={() => {
                setRubricOpen(false);
                setEditRubric(null);
              }}
            >
              <RubricForm
                key={editRubric?.id || `new-${formVersion}`}
                initial={editRubric}
                cancel={() => {
                  setEditRubric(null);
                  setRubricOpen(false);
                }}
                save={async (body) => {
                  await mutate(
                    editRubric
                      ? `/admin/rubrics/${editRubric.id}`
                      : `/admin/courses/${course.id}/rubrics`,
                    body,
                    editRubric ? "PUT" : "POST",
                  );
                  setEditRubric(null);
                  setRubricOpen(false);
                  setFormVersion((v) => v + 1);
                }}
              />
            </Modal>
          )}
        </>
      )}
      {tab === "exams" && (
        <>
          {editable && (
            <button
              className="button"
              disabled={
                !data.rubrics.length ||
                !data.topics.length ||
                course.status !== "ACTIVE"
              }
              onClick={() => {
                setEditExam(null);
                setExamOpen(true);
              }}
            >
              Tạo bài thi
            </button>
          )}
          {(!data.rubrics.length || !data.topics.length) && (
            <p className="muted">Thêm chủ đề và rubric trước khi tạo đề thi.</p>
          )}
          {data.exams.map((e) => (
            <section className="panel" key={e.id}>
              <div className="section-title">
                <div>
                  <h2>{e.name}</h2>
                  <p className="muted">
                    {e.blueprint.reduce((n, b) => n + b.count, 0)} câu ·{" "}
                    {Math.round(e.time_limit / 60)} phút
                  </p>
                </div>
                <Badge status={e.status} />
              </div>
              <p className="muted">
                Rubric: {data.rubrics.find((r) => r.id === e.rubric_id)?.name}
              </p>
              <details>
                <summary>Xem phân bổ câu hỏi</summary>
                <ul>
                  {e.blueprint.map((b, i) => (
                    <li key={i}>
                      {data.topics.find((t) => t.id === b.topic_id)?.name ||
                        "Chủ đề đã xóa"}
                      {" · "}
                      {
                        { EASY: "Dễ", MEDIUM: "Trung bình", HARD: "Khó" }[
                          b.difficulty
                        ]
                      }
                      {" · "}
                      {b.count} câu
                    </li>
                  ))}
                </ul>
              </details>
              <p className="muted">
                {e.max_attempts === null
                  ? "Làm lại không giới hạn"
                  : (e.max_attempts ?? 1) === 1
                    ? "Không cho làm lại"
                    : `Cho làm lại ${e.max_attempts - 1} lần`}
              </p>
              {admin && (
                <AttemptPolicy
                  key={`${e.id}-${e.max_attempts}`}
                  examId={e.id}
                  initial={e.max_attempts === undefined ? 1 : e.max_attempts}
                  saved={load}
                />
              )}
              {editable && e.status === "DRAFT" && (
                <div className="inline">
                  <Action action={() => mutate(`/admin/exams/${e.id}/publish`)}>
                    Sinh câu hỏi & công bố
                  </Action>
                  <button
                    className="button secondary"
                    onClick={() => {
                      setEditExam(e);
                      setExamOpen(true);
                    }}
                  >
                    Sửa bản nháp
                  </button>
                  <Action
                    className="text-button danger"
                    action={async () => {
                      if (!window.confirm(`Xóa đề nháp “${e.name}”?`)) return;
                      await mutate(`/admin/exams/${e.id}`, undefined, "DELETE");
                      if (editExam?.id === e.id) setEditExam(null);
                    }}
                  >
                    Xóa
                  </Action>
                </div>
              )}
              {editable && (
                <Action
                  className="button secondary"
                  disabled={course.status !== "ACTIVE"}
                  action={async () => {
                    const copy = await send<Exam>(`/admin/exams/${e.id}/copy`);
                    await load();
                    setEditExam(copy);
                    setExamOpen(true);
                  }}
                >
                  Sao chép thành bản nháp
                </Action>
              )}
              {e.status === "PUBLISHED" && (
                <p className="muted">
                  Đề đã công bố được giữ nguyên để bảo toàn kết quả. Sao chép
                  thành bản nháp để chỉnh sửa.
                </p>
              )}
              {editable && e.status === "PUBLISHED" && (
                <details>
                  <summary>Giao riêng đề này cho học viên</summary>
                  <Form
                    label="Giao bài cho sinh viên đã chọn"
                    onSubmit={(d) =>
                      mutate(`/admin/exams/${e.id}/assign`, {
                        student_ids: d.getAll("student_ids"),
                      })
                    }
                  >
                    <label>Sinh viên</label>
                    <div className="check-grid">
                      {students.map((u) => (
                        <label className="check" key={u.id}>
                          <input
                            type="checkbox"
                            name="student_ids"
                            value={u.id}
                          />
                          {u.name} <small>{u.username}</small>
                        </label>
                      ))}
                    </div>
                    {!students.length && (
                      <p className="muted">
                        Quản trị viên cần tạo tài khoản sinh viên trước.
                      </p>
                    )}
                  </Form>
                </details>
              )}
            </section>
          ))}
          {editable && examOpen && (
            <Modal
              title="Thiết lập đề thi"
              close={() => {
                setExamOpen(false);
                setEditExam(null);
              }}
            >
              <ExamForm
                key={editExam?.id || `new-${formVersion}`}
                initial={editExam}
                admin={admin}
                cancel={() => {
                  setEditExam(null);
                  setExamOpen(false);
                }}
                data={data}
                course={course}
                save={async (body) => {
                  await mutate(
                    editExam ? `/admin/exams/${editExam.id}` : "/admin/exams",
                    body,
                    editExam ? "PUT" : "POST",
                  );
                  setEditExam(null);
                  setExamOpen(false);
                  setFormVersion((v) => v + 1);
                }}
              />
            </Modal>
          )}
        </>
      )}
      {tab === "settings" && (
        <section className="panel">
          <h2>Thông tin môn học</h2>
          {editable ? (
            <>
              <Form
                label="Cập nhật môn học"
                onSubmit={async (d) => {
                  await mutate(
                    `/admin/courses/${course.id}`,
                    {
                      code: d.get("code"),
                      name: d.get("name"),
                      description: d.get("description"),
                    },
                    "PUT",
                  );
                  back();
                }}
              >
                <Field
                  name="code"
                  label="Mã môn học"
                  defaultValue={course.code}
                />
                <Field
                  name="name"
                  label="Tên môn học"
                  defaultValue={course.name}
                />
                <Field
                  name="description"
                  label="Mô tả"
                  defaultValue={course.description}
                  required={false}
                />
              </Form>
              <hr />
              <p className="muted">
                Lưu trữ môn học sẽ ngừng tạo bài mới và giữ lại kết quả hiện có.
              </p>
              <Action
                className="button secondary"
                action={async () => {
                  await mutate(
                    `/admin/courses/${course.id}/${course.status === "ARCHIVED" ? "restore" : "archive"}`,
                  );
                  back();
                }}
              >
                {course.status === "ARCHIVED"
                  ? "Khôi phục môn học"
                  : "Lưu trữ môn học"}
              </Action>
              <p className="muted">
                Chỉ xóa vĩnh viễn môn học khi không còn dữ liệu liên quan.
              </p>
              <Action
                className="text-button danger"
                action={async () => {
                  if (
                    !window.confirm(`Xóa vĩnh viễn môn học “${course.name}”?`)
                  )
                    return;
                  await send(
                    `/admin/courses/${course.id}`,
                    undefined,
                    "DELETE",
                  );
                  back();
                }}
              >
                Xóa môn học
              </Action>
            </>
          ) : (
            <p>Bạn có quyền xem môn học.</p>
          )}
        </section>
      )}
    </>
  );
}
function RubricForm({
  initial,
  save,
  cancel,
}: {
  initial: Rubric | null;
  save: (body: unknown) => Promise<void>;
  cancel: () => void;
}) {
  const [criteria, setCriteria] = useState<Criterion[]>(
    initial?.criteria || [
      {
        name: "Kiến thức chính xác",
        description: "Nêu đúng khái niệm và kiến thức trong tài liệu",
        max_score: 5,
        weight: 3,
      },
      {
        name: "Giải thích và ví dụ",
        description: "Giải thích rõ, có ví dụ phù hợp",
        max_score: 5,
        weight: 2,
      },
    ],
  );
  return (
    <section className="panel">
      <h2>{initial ? "Sửa rubric" : "Tạo rubric"}</h2>
      {initial && (
        <button className="text-button" onClick={cancel}>
          Hủy sửa rubric
        </button>
      )}
      <Form
        label="Lưu rubric"
        onSubmit={async (d) => save({ name: d.get("name"), criteria })}
      >
        <Field name="name" label="Tên rubric" defaultValue={initial?.name} />
        {criteria.map((c, i) => (
          <div className="criterion-form" key={i}>
            <label>
              Tên tiêu chí
              <input
                required
                value={c.name}
                onChange={(e) =>
                  setCriteria(
                    criteria.map((x, j) =>
                      i === j ? { ...x, name: e.target.value } : x,
                    ),
                  )
                }
              />
            </label>
            <label>
              Mô tả
              <input
                required
                value={c.description}
                onChange={(e) =>
                  setCriteria(
                    criteria.map((x, j) =>
                      i === j ? { ...x, description: e.target.value } : x,
                    ),
                  )
                }
              />
            </label>
            <label>
              Điểm tối đa
              <input
                type="number"
                min="0.1"
                max="100"
                step="0.1"
                required
                value={c.max_score}
                onChange={(e) =>
                  setCriteria(
                    criteria.map((x, j) =>
                      i === j ? { ...x, max_score: Number(e.target.value) } : x,
                    ),
                  )
                }
              />
            </label>
            <label>
              Trọng số
              <input
                type="number"
                min="0.1"
                max="100"
                step="0.1"
                required
                value={c.weight}
                onChange={(e) =>
                  setCriteria(
                    criteria.map((x, j) =>
                      i === j ? { ...x, weight: Number(e.target.value) } : x,
                    ),
                  )
                }
              />
            </label>
            <button
              type="button"
              className="text-button danger"
              disabled={criteria.length === 1}
              onClick={() => setCriteria(criteria.filter((_, j) => j !== i))}
            >
              Bỏ
            </button>
          </div>
        ))}
        <button
          type="button"
          className="text-button"
          disabled={criteria.length >= 20}
          onClick={() =>
            setCriteria([
              ...criteria,
              { name: "", description: "", max_score: 5, weight: 1 },
            ])
          }
        >
          + Thêm tiêu chí
        </button>
      </Form>
    </section>
  );
}
function ExamForm({
  admin,
  initial,
  data,
  course,
  save,
  cancel,
}: {
  initial: Exam | null;
  admin: boolean;
  data: Workspace;
  course: Course;
  save: (body: unknown) => Promise<void>;
  cancel: () => void;
}) {
  const [maxAttempts, setMaxAttempts] = useState<number | null>(
    initial?.max_attempts === undefined ? 1 : initial.max_attempts,
  );
  const [blueprint, setBlueprint] = useState<Blueprint[]>(
    initial?.blueprint || [
      { topic_id: data.topics[0]?.id || "", difficulty: "MEDIUM", count: 1 },
    ],
  );
  return (
    <section className="panel">
      <h2>{initial ? "Sửa bản nháp" : "Tạo bài thi"}</h2>
      {initial && (
        <button className="text-button" onClick={cancel}>
          Hủy sửa đề thi
        </button>
      )}
      <Form
        label="Lưu bản nháp"
        onSubmit={(d) =>
          save({
            name: d.get("name"),
            course_id: course.id,
            rubric_id: d.get("rubric_id"),
            time_limit: Number(d.get("minutes")) * 60,
            blueprint,
            max_attempts: maxAttempts,
          })
        }
      >
        <div className="form-grid">
          <Field name="name" label="Tên bài thi" defaultValue={initial?.name} />
          <Field
            name="minutes"
            label="Thời gian (phút)"
            type="number"
            min={1}
            max={180}
            defaultValue={initial ? initial.time_limit / 60 : 15}
          />
        </div>
        <label>
          Rubric
          <select name="rubric_id" required defaultValue={initial?.rubric_id}>
            <option value="">Chọn rubric</option>
            {data.rubrics.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name} · v{r.version}
              </option>
            ))}
          </select>
        </label>
        {admin && (
          <AttemptLimitFields value={maxAttempts} onChange={setMaxAttempts} />
        )}
        <h3>Phân bổ câu hỏi (Exam blueprint)</h3>
        {blueprint.map((b, i) => (
          <div className="blueprint-form" key={i}>
            <label>
              Chủ đề
              <select
                required
                value={b.topic_id}
                onChange={(e) =>
                  setBlueprint(
                    blueprint.map((x, j) =>
                      i === j ? { ...x, topic_id: e.target.value } : x,
                    ),
                  )
                }
              >
                <option value="">Chọn chủ đề</option>
                {data.topics.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Độ khó
              <select
                value={b.difficulty}
                onChange={(e) =>
                  setBlueprint(
                    blueprint.map((x, j) =>
                      i === j ? { ...x, difficulty: e.target.value } : x,
                    ),
                  )
                }
              >
                <option value="EASY">Dễ</option>
                <option value="MEDIUM">Trung bình</option>
                <option value="HARD">Khó</option>
              </select>
            </label>
            <label>
              Số câu
              <input
                type="number"
                min="1"
                max="20"
                required
                value={b.count}
                onChange={(e) =>
                  setBlueprint(
                    blueprint.map((x, j) =>
                      i === j ? { ...x, count: Number(e.target.value) } : x,
                    ),
                  )
                }
              />
            </label>
            <button
              className="text-button danger"
              type="button"
              disabled={blueprint.length === 1}
              onClick={() => setBlueprint(blueprint.filter((_, j) => i !== j))}
            >
              Bỏ
            </button>
          </div>
        ))}
        <button
          type="button"
          className="text-button"
          onClick={() =>
            setBlueprint([
              ...blueprint,
              {
                topic_id: data.topics[0]?.id || "",
                difficulty: "MEDIUM",
                count: 1,
              },
            ])
          }
        >
          + Thêm phân bổ
        </button>
        <p className="muted">
          Công bố đề sẽ sinh câu hỏi và cố định rubric, tài liệu, model và
          prompt. Tổng tối đa 20 câu.
        </p>
      </Form>
    </section>
  );
}
function ReviewPage({
  review,
  back,
  admin,
  refresh,
  open,
}: {
  review: Review;
  back: () => void;
  admin: boolean;
  refresh: () => Promise<void>;
  open: (id: string) => Promise<unknown>;
}) {
  return (
    <>
      <button className="text-button back" onClick={back}>
        <ArrowLeft size={16} />
        Tất cả kết quả
      </button>
      <div className="page-heading">
        <div>
          <span className="eyebrow">BÀI THI CỦA {review.student_name}</span>
          <h1>
            {review.exam_name} · Lần {review.attempt_number ?? 1}
          </h1>
          <p className="muted">
            Rubric v{review.snapshot.rubric_version} ·{" "}
            {review.snapshot.ai_provider === "demo"
              ? "Demo"
              : review.snapshot.llm_model}{" "}
            · Kiến thức {review.snapshot.knowledge_version.slice(0, 12)}
          </p>
        </div>
        <Badge status={review.status} />
      </div>
      <section className="panel">
        <label>
          Lịch sử làm bài
          <select
            value={review.id}
            onChange={(event) => void open(event.target.value)}
          >
            {(review.history || [review]).map((row) => (
              <option key={row.id} value={row.id}>
                Lần {row.attempt_number ?? 1} ·{" "}
                {row.created_at
                  ? new Date(row.created_at * 1000).toLocaleString("vi-VN")
                  : ""}{" "}
                ·{" "}
                {row.final_score === null
                  ? "Chưa xác nhận điểm"
                  : `${row.final_score}/10`}
              </option>
            ))}
          </select>
        </label>
        {admin && (
          <ResultActions
            key={review.id}
            result={review}
            refresh={refresh}
            deleted={async () => back()}
          />
        )}
      </section>
      <div className="notice">
        <strong>
          Điểm chính thức:{" "}
          {review.final_score === null
            ? "Chưa xác nhận"
            : `${review.final_score}/10`}
        </strong>
        <span>
          Điểm từng câu do AI đề xuất. Bài cần xem lại chưa có điểm chính thức.
        </span>
      </div>
      {review.attempts.map((a) => (
        <section className="panel" key={a.id}>
          <div className="section-title">
            <h2>Câu {a.sequence}</h2>
            <Badge status={a.status} />
          </div>
          <h3>{a.question.text}</h3>
          <div className="review-grid">
            <div>
              <span className="eyebrow">TRANSCRIPT SINH VIÊN ĐÃ NỘP</span>
              <p className="transcript">
                {a.transcript || "Chưa có câu trả lời"}
              </p>
              <small className="muted">
                Độ tin cậy STT:{" "}
                {a.stt_confidence === null
                  ? "—"
                  : `${Math.round(a.stt_confidence * 100)}%`}
              </small>
              <div className="media-grid">
                {a.evidence.map((e) =>
                  e.kind === "VIDEO" ? (
                    <video
                      key={e.id}
                      controls
                      preload="metadata"
                      src={`/api/evidence/${e.id}/content`}
                    />
                  ) : (
                    <audio
                      key={e.id}
                      controls
                      preload="metadata"
                      src={`/api/evidence/${e.id}/content`}
                    />
                  ),
                )}
              </div>
            </div>
            <div className="assessment">
              <span className="eyebrow">ĐÁNH GIÁ THEO RUBRIC</span>
              {a.assessment ? (
                <>
                  <div className="score">
                    {a.assessment.score ?? "—"}
                    <small>/ 10</small>
                  </div>
                  <p>{a.assessment.reasoning_summary}</p>
                  {a.assessment.criteria?.map((c) => (
                    <div className="criterion-score" key={c.name}>
                      <strong>
                        {c.name}: {c.score}
                      </strong>
                      <p>{c.comment}</p>
                    </div>
                  ))}
                  <small>
                    Độ tin cậy AI: {Math.round(a.assessment.confidence * 100)}%
                  </small>
                </>
              ) : (
                <p>Đang chờ xử lý.</p>
              )}
            </div>
          </div>
          <TranscriptionReview
            attempt={a}
            enabled={
              admin &&
              a.status === "GRADED" &&
              ["SUBMITTED", "REVIEW_REQUIRED", "COMPLETED"].includes(
                review.status,
              )
            }
            refresh={refresh}
          />
          {a.assessment?.retrieved_chunks?.length ? (
            <details>
              <summary>
                Tài liệu RAG được sử dụng (
                {a.assessment.retrieved_chunks.length})
              </summary>
              {a.assessment.retrieved_chunks.map((c) => (
                <blockquote key={c.id}>
                  <small>
                    Trang/slide {c.page} · Chunk {c.id}
                  </small>
                  <p>{c.content}</p>
                </blockquote>
              ))}
            </details>
          ) : null}
        </section>
      ))}
    </>
  );
}

function RoleEditor({
  user,
  saved,
}: {
  user: User;
  saved: () => Promise<void>;
}) {
  const [role, setRole] = useState(user.role);
  return (
    <div className="inline">
      <select
        aria-label={`Vai trò của ${user.name}`}
        value={role}
        onChange={(e) => setRole(e.target.value as User["role"])}
      >
        {["STUDENT", "TEACHER", "REVIEWER", "ADMIN"].map((r) => (
          <option key={r}>{r}</option>
        ))}
      </select>
      <Action
        className="text-button"
        disabled={role === user.role}
        action={async () => {
          await send(`/admin/users/${user.id}/role`, { role }, "PUT");
          await saved();
        }}
      >
        Lưu quyền
      </Action>
    </div>
  );
}
