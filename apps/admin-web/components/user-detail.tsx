"use client";
import { hasRole, roleNames } from "./api";
import { useCallback, useEffect, useState } from "react";
import { api, errorText, type User, type Review } from "./api";
import { Action, Badge, Empty } from "./shared";
import { ReviewPage } from "./admin";
import StudentCourses from "./student-courses";

type ClassRow = {
  id: string;
  code: string;
  name: string;
  course_name: string;
  teacher_name: string | null;
  starts_at: number;
  ends_at: number;
  phase: "COMPLETED" | "ONGOING" | "UPCOMING";
  membership: string;
  student_number: string | null;
};
type Profile = {
  user: User & { status: string; created_at: number };
  classes: ClassRow[];
};
type ClassDetail = {
  class: ClassRow;
  rounds: {
    id: string;
    name: string;
    status: string;
    opens_at: number | null;
    closes_at: number | null;
    sessions: {
      id: string;
      status: string;
      attempt_number: number;
      created_at: number;
      final_score: number | null;
    }[];
  }[];
};
const date = (n: number | null) =>
  n ? new Date(n * 1000).toLocaleString("vi-VN") : "Chưa xếp lịch";
const phases = { COMPLETED: "Đã học", ONGOING: "Đang học", UPCOMING: "Sẽ học" };

export default function UserDetail({
  person,
  viewer,
  back,
}: {
  person: User;
  viewer: User;
  back: () => void;
}) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [detail, setDetail] = useState<ClassDetail | null>(null);
  const [review, setReview] = useState<Review | null>(null);
  const [error, setError] = useState("");
  const [phase, setPhase] = useState("");
  const [enrollments, setEnrollments] = useState(false);
  const load = useCallback(async () => {
    setProfile(await api<Profile>(`/admin/users/${person.id}/profile`));
  }, [person.id]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- State follows the profile response.
    void load().catch((e) => setError(errorText(e)));
  }, [load]);
  const openReview = async (id: string) =>
    setReview(await api<Review>(`/admin/results/${id}`));
  if (review)
    return (
      <ReviewPage
        review={review}
        admin={hasRole(viewer, "ADMIN")}
        canGrade={hasRole(viewer, "ADMIN", "TEACHER")}
        back={() => {
          setReview(null);
          if (detail)
            void api<ClassDetail>(
              `/admin/users/${person.id}/classes/${detail.class.id}`,
            )
              .then(setDetail)
              .catch((e) => setError(errorText(e)));
        }}
        refresh={() => openReview(review.id)}
        open={openReview}
      />
    );
  if (enrollments)
    return (
      <StudentCourses
        student={person}
        editable={hasRole(viewer, "ADMIN", "EXAM_OFFICER")}
        back={() => setEnrollments(false)}
      />
    );
  if (!profile)
    return (
      <>
        <button className="text-button" onClick={back}>
          ← Danh sách người dùng
        </button>
        <Empty>{error || "Đang tải hồ sơ…"}</Empty>
      </>
    );
  return (
    <>
      <button
        className="text-button"
        onClick={detail ? () => setDetail(null) : back}
      >
        {detail ? "← Hồ sơ người dùng" : "← Danh sách người dùng"}
      </button>
      <div className="page-heading">
        <div>
          <h1>{profile.user.name}</h1>
          <p>
            {roleNames(profile.user)} ·{" "}
            {profile.user.email || profile.user.username}
          </p>
        </div>
        <Badge status={profile.user.status} />
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {detail ? (
        <>
          <section className="panel">
            <h2>
              {detail.class.code} · {detail.class.name}
            </h2>
            <p>
              {detail.class.course_name} ·{" "}
              {detail.class.teacher_name || "Chưa phân công giáo viên"}
            </p>
            <p>
              {phases[detail.class.phase]} · {date(detail.class.starts_at)} –{" "}
              {date(detail.class.ends_at)}
            </p>
          </section>
          <h2>Các đợt thi</h2>
          {!detail.rounds.length && (
            <Empty>Chưa có đợt thi được giao trong lớp này.</Empty>
          )}
          {detail.rounds.map((round) => (
            <section className="panel" key={round.id}>
              <h3>{round.name}</h3>
              <p>
                {date(round.opens_at)} – {date(round.closes_at)}
              </p>
              {!round.sessions.length ? (
                <Badge status="NOT_TAKEN" />
              ) : (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Lần thi</th>
                        <th>Thời gian</th>
                        <th>Trạng thái</th>
                        <th>Điểm</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {round.sessions.map((s) => (
                        <tr key={s.id}>
                          <td>{s.attempt_number}</td>
                          <td>{date(s.created_at)}</td>
                          <td>
                            <Badge status={s.status} />
                          </td>
                          <td>{s.final_score ?? "Chưa xác nhận"}</td>
                          <td>
                            <Action
                              className="text-button"
                              action={() => openReview(s.id)}
                            >
                              Chi tiết bài thi
                            </Action>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          ))}
        </>
      ) : (
        <>
          <section className="panel">
            <h2>Thông tin profile</h2>
            <dl className="profile-details">
              <div>
                <dt>Họ và tên</dt>
                <dd>{profile.user.name}</dd>
              </div>
              <div>
                <dt>Email</dt>
                <dd>{profile.user.email || "Chưa cập nhật"}</dd>
              </div>
              <div>
                <dt>Tên đăng nhập</dt>
                <dd>{profile.user.username}</dd>
              </div>
              <div>
                <dt>Vai trò</dt>
                <dd>{roleNames(profile.user)}</dd>
              </div>
              <div>
                <dt>Ngày tạo tài khoản</dt>
                <dd>{date(profile.user.created_at)}</dd>
              </div>
            </dl>
            {hasRole(person, "STUDENT") && (
              <button
                className="text-button"
                onClick={() => setEnrollments(true)}
              >
                Quản lý môn học được giao
              </button>
            )}
          </section>
          <div className="section-title">
            <h2>Lớp học liên quan</h2>
            <label>
              Thời gian lớp
              <select
                aria-label="Thời gian lớp"
                value={phase}
                onChange={(e) => setPhase(e.target.value)}
              >
                <option value="">Tất cả</option>
                {Object.entries(phases).map(([key, name]) => (
                  <option key={key} value={key}>
                    {name} (
                    {profile.classes.filter((c) => c.phase === key).length})
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="panel table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Lớp / Môn học</th>
                  <th>Giảng viên</th>
                  <th>Thời gian</th>
                  <th>Trạng thái</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {profile.classes
                  .filter((c) => !phase || c.phase === phase)
                  .map((c) => (
                    <tr key={c.id}>
                      <td>
                        <strong>
                          {c.code} · {c.name}
                        </strong>
                        <small className="block">{c.course_name}</small>
                        {c.student_number && (
                          <small>MSSV: {c.student_number}</small>
                        )}
                      </td>
                      <td>{c.teacher_name || "Chưa phân công"}</td>
                      <td>
                        {date(c.starts_at)}
                        <br />
                        {date(c.ends_at)}
                      </td>
                      <td>
                        {phases[c.phase]}
                        {c.membership === "HISTORY" && (
                          <small className="block">
                            Đã rời lớp · còn lịch sử thi
                          </small>
                        )}
                      </td>
                      <td>
                        <Action
                          className="text-button"
                          action={async () =>
                            setDetail(
                              await api<ClassDetail>(
                                `/admin/users/${person.id}/classes/${c.id}`,
                              ),
                            )
                          }
                        >
                          Chi tiết lớp
                        </Action>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
            {!profile.classes.some((c) => !phase || c.phase === phase) && (
              <Empty>Không có lớp trong nhóm này.</Empty>
            )}
          </div>
        </>
      )}
    </>
  );
}
