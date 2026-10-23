import type { Assessment } from "./api";

export default function PronunciationScore({
  result,
}: {
  result: Assessment["pronunciation"];
}) {
  if (!result) return null;
  return (
    <section aria-label="Đánh giá phát âm tiếng Anh">
      <h4>Phát âm tiếng Anh · GOPT</h4>
      {result.status === "COMPLETED" && result.scores ? (
        <>
          <p>
            <strong>{result.scores.total} / 10</strong>
            {" · "}Độ chính xác: {result.scores.accuracy}
            {" · "}Trôi chảy: {result.scores.fluency}
            {" · "}Ngữ điệu: {result.scores.prosody}
          </p>
          <p className="muted">
            {result.applied_criteria?.length
              ? `Đã tính theo trọng số rubric: ${result.applied_criteria.join(", ")}. `
              : "Điểm tham khảo từ audio và transcript, chưa cộng vào tổng điểm. "}
            Giảng viên cần nghe bản ghi và kiểm tra transcript trước khi kết
            luận.
          </p>
        </>
      ) : (
        <p className="error">{result.message || "Chưa chấm được phát âm."}</p>
      )}
    </section>
  );
}
