"use client";
import { useCallback, useEffect, useState } from "react";
import { api, send, errorText, type Course, type User } from "./api";
import { Action, Badge } from "./shared";

type Sitting = {
  id: string;
  exam_name: string;
  course_code: string;
  student_name: string;
  student_email: string | null;
  attempt_number: number;
  status: string;
  created_at: number;
  media_bytes: number;
  pending_bytes: number;
  files: number;
  media_removed_at: number | null;
  can_clean: boolean;
};
type Group = {
  id: string;
  name: string;
  code?: string;
  email?: string;
  sessions: number;
  bytes: number;
};
type Report = {
  rows: Sitting[];
  total: number;
  page: number;
  limit: number;
  media_bytes: number;
  files: number;
  backend: string;
  by_course: Group[];
  by_student: Group[];
  cleanup: {
    files: number;
    estimated_bytes: number;
    unknown_size: number;
    retrying: number;
  };
  local: {
    staging_bytes: number;
    objects_bytes: number | null;
    disk_total: number | null;
    disk_free: number | null;
  };
};
type Preview = {
  token: string;
  sessions: number;
  files: number;
  media_bytes: number;
  staging_bytes: number;
  mode: "MEDIA" | "ALL";
  confirmation: string;
};
export const bytes = (n: number | null) =>
  n === null
    ? "Không có số liệu"
    : n < 1024
      ? `${n} B`
      : n < 1048576
        ? `${(n / 1024).toFixed(1)} KiB`
        : n < 1073741824
          ? `${(n / 1048576).toFixed(1)} MiB`
          : `${(n / 1073741824).toFixed(2)} GiB`;

export default function StorageManager() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [course, setCourse] = useState("");
  const [student, setStudent] = useState("");
  const [before, setBefore] = useState("");
  const [page, setPage] = useState(1);
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [mode, setMode] = useState<"MEDIA" | "ALL">("MEDIA");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [confirmation, setConfirmation] = useState("");
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const params = new URLSearchParams();
  if (course) params.set("course_id", course);
  if (student) params.set("student_id", student);
  if (before)
    params.set(
      "before",
      String(new Date(`${before}T00:00:00`).getTime() / 1000),
    );
  const query = params.toString();
  const load = useCallback(async () => {
    setError("");
    setReport(await api<Report>(`/admin/storage?${query}&page=${page}`));
  }, [query, page]);
  useEffect(() => {
    let active = true;
    Promise.all([api<Course[]>("/admin/courses"), api<User[]>("/admin/users")])
      .then(([c, u]) => {
        if (active) {
          setCourses(c);
          setUsers(u);
        }
      })
      .catch((e) => {
        if (active) setError(errorText(e));
      });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    let active = true;
    api<Report>(`/admin/storage?${query}&page=${page}`)
      .then((r) => {
        if (active) {
          setReport(r);
          setError("");
        }
      })
      .catch((e) => {
        if (active) setError(errorText(e));
      });
    return () => {
      active = false;
    };
  }, [query, page]);
  function reset() {
    setPage(1);
    setReport(null);
    setSelected([]);
    setPreview(null);
    setMessage("");
  }
  function choose(ids: string[]) {
    setSelected(ids);
    setPreview(null);
    setConfirmation("");
  }
  const eligible =
    report?.rows.filter((r) => r.can_clean).map((r) => r.id) || [];
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Lần thi & dung lượng</h1>
          <p>Thống kê bản ghi, lọc lần thi và dọn dữ liệu đã thi.</p>
        </div>
        <Action action={load} disabled={busy}>
          Làm mới dung lượng
        </Action>
      </div>
      <section className="panel">
        <div className="form-grid">
          <label>
            Môn học
            <select
              value={course}
              disabled={busy}
              onChange={(e) => {
                setCourse(e.target.value);
                reset();
              }}
            >
              <option value="">Tất cả môn</option>
              {courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.code} · {c.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Người làm bài
            <select
              value={student}
              disabled={busy}
              onChange={(e) => {
                setStudent(e.target.value);
                reset();
              }}
            >
              <option value="">Tất cả người dùng</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} · {u.email || u.username}
                </option>
              ))}
            </select>
          </label>
          <label>
            Lần thi tạo trước ngày
            <input
              type="date"
              value={before}
              disabled={busy}
              onChange={(e) => {
                setBefore(e.target.value);
                reset();
              }}
            />
          </label>
        </div>
        <a
          className="text-button"
          href={`/api/admin/storage/report.xlsx?${query}`}
          download
        >
          Xuất báo cáo dung lượng Excel
        </a>
      </section>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {message && (
        <p className="notice" role="status">
          {message}
        </p>
      )}
      {report && (
        <>
          <section className="panel" aria-label="Thống kê dung lượng">
            <h2>Dung lượng trong bộ lọc</h2>
            <p>
              <strong>{bytes(report.media_bytes)}</strong> bản ghi ·{" "}
              {report.files} file · {report.total} lần thi
            </p>
            <p>
              Dung lượng bản ghi dựa trên kích thước file đã lưu và kiểm tra
              checksum; không bao gồm database, tài liệu học hoặc bản sao lưu.
            </p>
            <h3>Kho lưu trữ toàn hệ thống</h3>
            <p>
              {report.backend === "s3"
                ? "Kho đối tượng S3"
                : "Kho file trên server"}{" "}
              · File tải tạm: {bytes(report.local.staging_bytes)}
              {report.local.objects_bytes !== null &&
                ` · Toàn bộ kho file local: ${bytes(report.local.objects_bytes)}`}
            </p>
            <p>
              Ổ đĩa chứa thư mục dữ liệu còn {bytes(report.local.disk_free)} /{" "}
              {bytes(report.local.disk_total)}.{" "}
              {report.backend === "s3" &&
                "Đây là ổ đĩa server API, không phải dung lượng trống của S3."}
            </p>
            <p>
              Chờ xóa: {report.cleanup.files} file, khoảng{" "}
              {bytes(report.cleanup.estimated_bytes)}
              {report.cleanup.unknown_size > 0 &&
                `; ${report.cleanup.unknown_size} file cũ chưa có kích thước`}{" "}
              · Đang thử lại: {report.cleanup.retrying}.
            </p>
            <p className="muted">
              Dung lượng chỉ được giải phóng khi worker xóa file thành công. Bấm
              làm mới để kiểm tra tiến độ.
            </p>
          </section>
          <div className="form-grid">
            {[
              ["Theo môn học", report.by_course],
              ["Theo người làm bài (tối đa 100)", report.by_student],
            ].map(([title, data]) => (
              <details className="panel" key={title as string}>
                <summary>{title as string}</summary>
                <table>
                  <thead>
                    <tr>
                      <th>Tên</th>
                      <th>Lần thi</th>
                      <th>Bản ghi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(data as Group[]).map((g) => (
                      <tr key={g.id}>
                        <td>
                          {g.code ? `${g.code} · ` : ""}
                          {g.name}
                          {g.email && <small> · {g.email}</small>}
                        </td>
                        <td>{g.sessions}</td>
                        <td>{bytes(g.bytes)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </details>
            ))}
          </div>
          <section className="panel table-wrap">
            <h2>Danh sách lần thi</h2>
            <label>
              <input
                type="checkbox"
                disabled={busy || !eligible.length}
                checked={
                  !!eligible.length &&
                  eligible.every((id) => selected.includes(id))
                }
                onChange={(e) =>
                  choose(
                    e.target.checked
                      ? Array.from(new Set([...selected, ...eligible]))
                      : selected.filter((id) => !eligible.includes(id)),
                  )
                }
              />{" "}
              Chọn lần thi đã kết thúc trên trang này
            </label>
            <table>
              <thead>
                <tr>
                  <th>Chọn</th>
                  <th>Bài thi / môn</th>
                  <th>Người làm bài</th>
                  <th>Trạng thái</th>
                  <th>Bản ghi</th>
                </tr>
              </thead>
              <tbody>
                {report.rows.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <input
                        type="checkbox"
                        aria-label={`Chọn lần ${r.attempt_number} của ${r.student_name} - ${r.exam_name}`}
                        checked={selected.includes(r.id)}
                        disabled={busy || !r.can_clean}
                        onChange={(e) =>
                          choose(
                            e.target.checked
                              ? [...selected, r.id]
                              : selected.filter((id) => id !== r.id),
                          )
                        }
                      />
                    </td>
                    <td>
                      {r.exam_name}
                      <br />
                      <small>
                        {r.course_code} · Lần {r.attempt_number} ·{" "}
                        {new Date(r.created_at * 1000).toLocaleString("vi-VN")}
                      </small>
                    </td>
                    <td>
                      {r.student_name}
                      <br />
                      <small>{r.student_email}</small>
                    </td>
                    <td>
                      <Badge status={r.status} />
                      {!r.can_clean && <small> Chưa thể dọn</small>}
                    </td>
                    <td>
                      {bytes(r.media_bytes)} · {r.files} file
                      {r.pending_bytes > 0 && (
                        <p>Đang tải, dự kiến {bytes(r.pending_bytes)}</p>
                      )}
                      {r.media_removed_at && (
                        <p>
                          Đã dọn bản ghi{" "}
                          {new Date(
                            r.media_removed_at * 1000,
                          ).toLocaleDateString("vi-VN")}
                        </p>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!report.rows.length && <p>Không có lần thi trong bộ lọc.</p>}
            <div className="actions">
              <button
                className="button secondary"
                disabled={busy || page === 1}
                onClick={() => setPage((p) => p - 1)}
              >
                Trang trước
              </button>
              <span>
                Trang {page} /{" "}
                {Math.max(1, Math.ceil(report.total / report.limit))}
              </span>
              <button
                className="button secondary"
                disabled={busy || page * report.limit >= report.total}
                onClick={() => setPage((p) => p + 1)}
              >
                Trang sau
              </button>
            </div>
          </section>
        </>
      )}
      <section className="panel" aria-label="Dọn dữ liệu đã thi">
        <h2>Dọn {selected.length} lần thi đã chọn</h2>
        <p>
          Có thể chọn qua nhiều trang, tối đa 500 lần/lượt. Lọc môn hoặc người
          làm bài để dọn đúng phạm vi.
        </p>
        <label>
          Dữ liệu cần xóa
          <select
            value={mode}
            disabled={busy}
            onChange={(e) => {
              setMode(e.target.value as "MEDIA" | "ALL");
              setPreview(null);
              setConfirmation("");
            }}
          >
            <option value="MEDIA">Chỉ xóa bản ghi, giữ điểm và lịch sử</option>
            <option value="ALL">Xóa toàn bộ dữ liệu lần thi đã chọn</option>
          </select>
        </label>
        <p>
          {mode === "MEDIA"
            ? "Xóa audio, camera và màn hình; giữ transcript, điểm và lịch sử. Không thể phát lại hoặc nhận dạng lại các file đã xóa."
            : "Xóa câu trả lời, điểm, lịch sử chấm và bản ghi. Giữ môn, đề, tài khoản và dấu vết kiểm toán. Lần thi đã xóa không còn tính vào số lượt đã dùng."}
        </p>
        <Action
          disabled={busy || !selected.length || selected.length > 500}
          action={async () => {
            setBusy(true);
            try {
              setPreview(
                await send<Preview>("/admin/storage/preview", {
                  session_ids: selected,
                  mode,
                }),
              );
              setConfirmation("");
            } finally {
              setBusy(false);
            }
          }}
        >
          Xem trước dữ liệu sẽ xóa
        </Action>
        {preview && (
          <div className="notice">
            <h3>Xác nhận phạm vi xóa</h3>
            <p>
              {preview.sessions} lần thi · {preview.files} file · Dự kiến giải
              phóng {bytes(preview.media_bytes + preview.staging_bytes)}. Thao
              tác không thể hoàn tác.
            </p>
            <label>
              Lý do dọn dữ liệu
              <input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                maxLength={1000}
                disabled={busy}
              />
            </label>
            <label>
              Nhập {preview.confirmation} để xác nhận
              <input
                value={confirmation}
                onChange={(e) => setConfirmation(e.target.value)}
                disabled={busy}
                autoComplete="off"
              />
            </label>
            <Action
              className="button danger"
              disabled={
                busy ||
                confirmation !== preview.confirmation ||
                reason.trim().length < 5
              }
              action={async () => {
                setBusy(true);
                try {
                  const result = await send<{ message: string }>(
                    "/admin/storage/cleanup",
                    {
                      token: preview.token,
                      confirmation,
                      reason: reason.trim(),
                    },
                  );
                  setMessage(result.message);
                  setPreview(null);
                  setSelected([]);
                  setConfirmation("");
                  await load();
                } finally {
                  setBusy(false);
                }
              }}
            >
              Xác nhận xóa dữ liệu
            </Action>
          </div>
        )}
      </section>
    </>
  );
}
