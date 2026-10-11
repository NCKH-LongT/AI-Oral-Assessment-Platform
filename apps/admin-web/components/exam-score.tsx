import type { ScoreSummary } from "./api";

export default function ExamScore({
  summary,
  status,
}: {
  summary?: ScoreSummary | null;
  status: string;
}) {
  if (!summary) return null;
  const complete = summary.total_score !== null;
  return (
    <section className="panel" aria-label="Điểm tổng bài thi">
      <h3>
        Điểm tổng: {complete ? `${summary.total_score}/10` : "Chưa đủ điểm"}
      </h3>
      <p>
        Trung bình cộng điểm tất cả {summary.question_count} câu, làm tròn 2 chữ
        số thập phân.
      </p>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Câu hỏi</th>
              <th>Điểm /10</th>
            </tr>
          </thead>
          <tbody>
            {summary.question_scores.map((q) => (
              <tr key={q.sequence}>
                <td>Câu {q.sequence}</td>
                <td>{q.score === null ? "Chưa có điểm" : q.score}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {complete ? (
        <p>
          ({summary.question_scores.map((q) => q.score).join(" + ")}) ÷{" "}
          {summary.question_count} = {summary.total_score}/10
        </p>
      ) : (
        <p>
          Đã có điểm {summary.graded_question_count}/{summary.question_count}{" "}
          câu. Điểm tổng sẽ xuất hiện khi tất cả câu đã được chấm thành công.
        </p>
      )}
      {complete && status !== "COMPLETED" && (
        <p className="muted">
          Điểm tổng tạm tính; bài thi đang chờ hoàn tất hoặc giảng viên duyệt
          điểm chính thức.
        </p>
      )}
    </section>
  );
}
