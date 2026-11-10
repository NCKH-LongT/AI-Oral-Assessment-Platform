import type { Assessment } from "./api";

export default function PronunciationScore({
  result,
}: {
  result: Assessment["pronunciation"];
}) {
  if (!result) return null;
  const isPoor = result.audio_quality?.status === "POOR";

  return (
    <section aria-label="Đánh giá phát âm tiếng Anh">
      <h4>Phát âm tiếng Anh · HuBERT & Audio QA</h4>

      {result.audio_quality && (
        <div style={{ marginBottom: "0.5rem", fontSize: "0.85rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <span
            style={{
              padding: "0.15rem 0.45rem",
              borderRadius: 4,
              fontWeight: 600,
              fontSize: "0.75rem",
              background: isPoor ? "#fee2e2" : result.audio_quality.status === "WARNING" ? "#fef3c7" : "#dcfce7",
              color: isPoor ? "#991b1b" : result.audio_quality.status === "WARNING" ? "#854d0e" : "#166534",
            }}
          >
            Audio QA: {result.audio_quality.status}
          </span>
          <span className="muted">
            SNR: {result.audio_quality.snr_db} dB · Clipping: {(result.audio_quality.clipping_ratio * 100).toFixed(1)}%
          </span>
        </div>
      )}

      {isPoor ? (
        <p className="notice" style={{ color: "#b91c1c" }}>
          ⚠️ Chất lượng âm thanh không đạt chuẩn chấm tự động ({result.audio_quality?.recommendation}). 
          Bài thi được chuyển sang cho Giảng viên nghe và thẩm định thủ công trực tiếp từ audio gốc.
        </p>
      ) : result.status === "COMPLETED" && result.scores ? (
        <>
          <p>
            <strong>{result.scores.total} / 10</strong>
            {" · "}Độ chính xác: {result.scores.accuracy}
            {" · "}Trôi chảy: {result.scores.fluency}
            {" · "}Ngữ điệu: {result.scores.prosody}
            {result.metrics?.wpm ? ` · Tốc độ: ${result.metrics.wpm} WPM` : ""}
          </p>
          <p className="muted">
            {result.applied_criteria?.length
              ? `Đã tính vào điểm tiêu chí rubric: ${result.applied_criteria.join(", ")}. `
              : "Điểm tham khảo từ audio và transcript, chưa cộng vào tổng điểm. "}
            Giảng viên cần nghe bản ghi và đối chiếu transcript trước khi chốt kết quả.
          </p>
        </>
      ) : (
        <p className="error">{result.message || "Chưa chấm được phát âm."}</p>
      )}
    </section>
  );
}
