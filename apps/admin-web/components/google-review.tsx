"use client";
import { LoaderCircle } from "lucide-react";
import { Review, send } from "./api";
import { Field, Form } from "./shared";

export function GoogleReview({
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
          <strong>Transcript Google dùng cho đánh giá hiện tại</strong>
          <p className="transcript">{latest.result.transcript}</p>
          <small>
            STT {Math.round(latest.result.stt_confidence * 100)}% · Xử lý audio:{" "}
            {latest.result.preprocessing}
          </small>
        </div>
      )}
      {pending ? (
        <p role="status" className="processing-status">
          <LoaderCircle className="spin" size={20} />
          Đang chờ nhận dạng Google và chấm lại…
        </p>
      ) : (
        enabled && (
          <details>
            <summary>Nhận dạng lại bằng Google & chấm lại</summary>
            <p>
              Gửi audio gốc qua bước xử lý âm thanh rồi đến Google Cloud
              Speech-to-Text (có thể phát sinh phí). Kết quả được chấm theo
              rubric, AI và kiến thức đã cố định của đề. Transcript đã nộp và
              lịch sử đánh giá vẫn được giữ.
            </p>
            <Form
              label="Dùng Google nhận dạng và chấm lại"
              onSubmit={async (d) => {
                await send(`/admin/attempts/${attempt.id}/google-review`, {
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
                  <summary>Transcript và đánh giá Google mới</summary>
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
