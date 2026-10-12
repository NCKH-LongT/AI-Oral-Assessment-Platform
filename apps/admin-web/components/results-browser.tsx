"use client";

import { useEffect, useState } from "react";
import {
  api,
  errorText,
  type Course,
  type ProcessingSummary,
  type Sitting,
} from "./api";
import { Action, Badge, Empty } from "./shared";

export type ResultFilters = {
  course: string;
  exam: string;
  date: string;
  attempt: string;
  status: string;
  query: string;
};
export const initialResultFilters: ResultFilters = {
  course: "",
  exam: "",
  date: "",
  attempt: "",
  status: "all",
  query: "",
};
type Roster = {
  exams: { id: string; name: string; status: string }[];
  dates: string[];
  attempt_numbers: number[];
  rows: {
    student_id: string;
    student_name: string;
    email: string | null;
    student_number: string | null;
    session: Sitting | null;
    processing: ProcessingSummary | null;
    status: string;
    final_score: number | null;
    ai_score?: number | null;
    low_score?: boolean;
  }[];
};

export default function ResultsBrowser({
  courses,
  filters,
  setFilters,
  open,
}: {
  courses: Course[];
  filters: ResultFilters;
  setFilters: (next: ResultFilters) => void;
  open: (id: string) => Promise<unknown>;
}) {
  const [data, setData] = useState<{ key: string; roster: Roster } | null>(
    null,
  );
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const params = new URLSearchParams();
  if (filters.exam) params.set("exam_id", filters.exam);
  if (filters.date) params.set("exam_date", filters.date);
  if (filters.attempt) params.set("attempt_number", filters.attempt);
  const path = filters.course
    ? `/admin/courses/${filters.course}/results?${params}`
    : "";
  useEffect(() => {
    if (!path) return;
    let active = true;
    let pending = false;
    const refresh = async () => {
      if (pending) return;
      pending = true;
      try {
        const roster = await api<Roster>(path);
        if (active) {
          setData({ key: path, roster });
          setError("");
        }
      } catch (e) {
        if (active) setError(errorText(e));
      } finally {
        pending = false;
      }
    };
    void refresh();
    const timer = setInterval(() => void refresh(), 4000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [path, revision]);
  const roster = data?.key === path ? data.roster : null;
  // Keep the exam choices while loading a date/attempt filter for the same course.
  const exams = data?.key.startsWith(
    `/admin/courses/${filters.course}/results?`,
  )
    ? data.roster.exams
    : [];
  const patch = (value: Partial<ResultFilters>) =>
    setFilters({ ...filters, ...value });
  const rows = roster?.rows || [];
  const submitted = (row: Roster["rows"][number]) =>
    ["SUBMITTED", "REVIEW_REQUIRED", "COMPLETED"].includes(row.status);
  const selected = rows.filter((row) => {
    const matches =
      `${row.student_name} ${row.email || ""} ${row.student_number || ""}`
        .toLocaleLowerCase()
        .includes(filters.query.toLocaleLowerCase());
    return (
      matches &&
      (filters.status === "all" ||
        (filters.status === "submitted"
          ? submitted(row)
          : filters.status === "not_submitted"
            ? !submitted(row)
            : filters.status === "processing"
              ? row.status === "SUBMITTED"
              : filters.status === "completed"
                ? row.status === "COMPLETED"
                : row.processing?.failed || row.status === "REVIEW_REQUIRED"))
    );
  });
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">THEO DÕI BÀI THI</span>
          <h1>Kết quả &amp; xem lại</h1>
          <p className="muted">
            Chọn môn và đề thi để xem cả sinh viên đã nộp và chưa nộp bài. Trạng
            thái tự cập nhật.
          </p>
        </div>
        <button
          className="button secondary"
          onClick={() => setRevision((value) => value + 1)}
        >
          Làm mới
        </button>
      </div>
      <section className="panel">
        <div className="results-filters">
          <label>
            Môn học
            <select
              value={filters.course}
              onChange={(e) =>
                setFilters({ ...initialResultFilters, course: e.target.value })
              }
            >
              <option value="">Chọn môn học</option>
              {courses.map((course) => (
                <option key={course.id} value={course.id}>
                  {course.code} · {course.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Đề / kỳ thi
            <select
              disabled={!filters.course}
              value={filters.exam}
              onChange={(e) =>
                patch({ exam: e.target.value, date: "", attempt: "" })
              }
            >
              <option value="">Chọn đề / kỳ thi</option>
              {exams.map((exam) => (
                <option key={exam.id} value={exam.id}>
                  {exam.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Ngày thi (giờ Việt Nam)
            <input
              type="date"
              disabled={!filters.exam}
              value={filters.date}
              onChange={(e) => patch({ date: e.target.value })}
              list="exam-dates"
            />
            <datalist id="exam-dates">
              {roster?.dates.map((date) => (
                <option key={date} value={date} />
              ))}
            </datalist>
          </label>
          <label>
            Lần làm bài
            <select
              disabled={!filters.exam}
              value={filters.attempt}
              onChange={(e) => patch({ attempt: e.target.value })}
            >
              <option value="">Lần gần nhất trong bộ lọc</option>
              {(
                roster?.attempt_numbers ||
                (filters.attempt ? [Number(filters.attempt)] : [])
              ).map((n) => (
                <option key={n} value={n}>
                  Lần {n}
                </option>
              ))}
            </select>
          </label>
        </div>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {!filters.course ? (
          <Empty>Chọn môn học để bắt đầu.</Empty>
        ) : !roster ? (
          <Empty>Đang tải danh sách…</Empty>
        ) : !filters.exam ? (
          <Empty>Chọn đề / kỳ thi.</Empty>
        ) : (
          <>
            <p role="status">
              {rows.length} sinh viên · {rows.filter(submitted).length} đã nộp ·{" "}
              {rows.filter((r) => !submitted(r)).length} chưa nộp ·{" "}
              {rows.filter((r) => r.status === "COMPLETED").length} có điểm
              chính thức
            </p>
            <p className="muted">
              Bỏ trống ngày để xem mọi ngày. Khi chọn ngày, sinh viên chưa có
              lượt thi được đối chiếu theo lịch giao bài; nếu chưa có lịch, danh
              sách theo quyền được giao đề.
            </p>
            <div className="results-filters">
              <label>
                Tìm sinh viên
                <input
                  value={filters.query}
                  onChange={(e) => patch({ query: e.target.value })}
                  placeholder="Tên, mã sinh viên hoặc email"
                />
              </label>
              <label>
                Trạng thái bài thi
                <select
                  value={filters.status}
                  onChange={(e) => patch({ status: e.target.value })}
                >
                  <option value="all">Tất cả</option>
                  <option value="submitted">Đã nộp bài</option>
                  <option value="not_submitted">Chưa nộp bài</option>
                  <option value="processing">Đang xử lý STT / chấm</option>
                  <option value="completed">Có điểm chính thức</option>
                  <option value="review">Lỗi / cần xem lại</option>
                </select>
              </label>
            </div>
            {!selected.length ? (
              <Empty>Không có sinh viên phù hợp bộ lọc.</Empty>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Sinh viên</th>
                      <th>Lần thi / ngày thi</th>
                      <th>Trạng thái</th>
                      <th>Điểm cuối cùng</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {selected.map((row) => (
                      <tr
                        key={row.student_id}
                        className={
                          row.low_score && row.status === "REVIEW_REQUIRED"
                            ? "low-score-row"
                            : undefined
                        }
                      >
                        <td>
                          <strong>{row.student_name}</strong>
                          <p className="muted">
                            {row.student_number || row.email || "—"}
                          </p>
                        </td>
                        <td>
                          {row.session ? (
                            <>
                              Lần {row.session.attempt_number}
                              <p>
                                {new Date(
                                  (row.session.started_at ||
                                    row.session.created_at) * 1000,
                                ).toLocaleString("vi-VN", {
                                  timeZone: "Asia/Ho_Chi_Minh",
                                })}
                              </p>
                            </>
                          ) : (
                            "Chưa thi"
                          )}
                        </td>
                        <td>
                          <Badge
                            status={
                              row.processing && row.status === "SUBMITTED"
                                ? row.processing.status
                                : row.status
                            }
                          />
                          {row.low_score &&
                            row.status === "REVIEW_REQUIRED" && (
                              <p className="error">
                                AI: {row.ai_score}/10 · dưới 5, cần chấm lại
                              </p>
                            )}
                          {row.processing && (
                            <p className="muted">
                              STT {row.processing.transcribed}/
                              {row.processing.total} · Xử lý{" "}
                              {row.processing.completed}/{row.processing.total}
                              {row.processing.failed > 0 &&
                                ` · ${row.processing.failed} câu lỗi`}
                            </p>
                          )}
                        </td>
                        <td>
                          {row.status === "COMPLETED" &&
                          row.final_score != null ? (
                            <strong>{row.final_score}/10</strong>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td>
                          {row.session ? (
                            <Action
                              className="text-button"
                              action={() => open(row.session!.id)}
                            >
                              Xem bài →
                            </Action>
                          ) : (
                            <span className="muted">Chưa có bài nộp</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </section>
    </>
  );
}
