"use client";
import { LoaderCircle } from "lucide-react";
import { Review, send } from "./api";
import { Field, Form } from "./shared";

export function TranscriptionReview({
  attempt,
  enabled,
  refresh,
}: {
  attempt: Review["attempts"][number];
  enabled: boolean;
  refresh: () => Promise<void>;
}) {
  const pending = attempt.reviews.some((r) => r.status === "PENDING");
  const latest = attempt.reviews.find((r) => r.status === "COMPLETED");
  return (
    <div>
      {latest?.result && (
        <div className="notice">
          <strong>Transcript nhận dạng lại dùng cho đánh giá hiện tại</strong>
          <p className="transcript">{latest.result.transcript}</p>
          <small>
            {latest.result.confidence_source === "unavailable"
              ? "Nhà cung cấp không trả độ tin cậy STT"
              : `STT ${Math.round(latest.result.stt_confidence * 100)}%`}{" "}
            · Xử lý audio: {latest.result.preprocessing}
          </small>
        </div>
      )}
      {pending ? (
        <p role="status" className="processing-status">
          <LoaderCircle className="spin" size={20} />
          Đang chờ nhận dạng và chấm lại…
        </p>
      ) : (
        enabled && (
          <details>
            <summary>Nhận dạng lại bằng Gemini & chấm lại</summary>
            <p>
              Gửi audio gốc đến Gemini trên server để nhận dạng lại (có thể phát
              sinh phí). Dùng Gemini API key, không cần JSON Google Cloud STT.
              Kết quả được chấm theo rubric, AI và kiến thức đã cố định của đề.
              Transcript đã nộp và lịch sử đánh giá vẫn được giữ. Gemini không
              cung cấp độ tin cậy âm học nên kết quả nhận dạng lại cần giảng
              viên kiểm tra.
            </p>
            <Form
              label="Dùng Gemini nhận dạng và chấm lại"
              onSubmit={async (d) => {
                await send(`/admin/attempts/${attempt.id}/gemini-review`, {
                  reason: d.get("reason"),
                });
                await refresh();
              }}
            >
              <Field label="Lý do nhận dạng / chấm lại" name="reason" />
            </Form>
          </details>
        )
      )}
      {!!attempt.reviews.length && (
        <details>
          <summary>
            Lịch sử nhận dạng / chấm lại ({attempt.reviews.length})
          </summary>
          {attempt.reviews.map((r) => (
            <div className="panel" key={r.id}>
              <strong>
                {new Date(r.created_at * 1000).toLocaleString("vi-VN")} ·{" "}
                {r.status}
              </strong>
              <p>{r.reason}</p>
              {r.error && (
                <p role="alert" className="error">
                  {r.error}
                </p>
              )}
              <details>
                <summary>Đánh giá trước lần xử lý này</summary>
                <p>{r.original.transcript}</p>
                <p>Điểm: {r.original.assessment?.score ?? "Chưa xác nhận"}</p>
                <p>{r.original.assessment?.reasoning_summary}</p>
                <pre>{JSON.stringify(r.original.assessment, null, 2)}</pre>
              </details>
              {r.result && (
                <details>
                  <summary>Transcript và đánh giá mới</summary>
                  <p>{r.result.transcript}</p>
                  <p>Điểm: {r.result.assessment.score ?? "Chưa xác nhận"}</p>
                  <p>{r.result.assessment.reasoning_summary}</p>
                  <pre>{JSON.stringify(r.result.assessment, null, 2)}</pre>
                </details>
              )}
            </div>
          ))}
        </details>
      )}
    </div>
  );
}
