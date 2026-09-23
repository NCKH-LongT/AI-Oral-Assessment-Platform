"use client";
import { useState } from "react";
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
  const [provider, setProvider] = useState<"gemini" | "google">("gemini");
  const pending = attempt.reviews.some((r) => r.status === "PENDING");
  const latest = attempt.reviews.find((r) => r.status === "COMPLETED");
  return (
    <div>
      {latest?.result && (
        <div className="notice">
          <strong>
            {latest.policy?.provider === "grading"
              ? "Transcript đã nộp được dùng để chấm lại"
              : "Transcript nhận dạng lại dùng cho đánh giá hiện tại"}
          </strong>
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
          Đang chờ xử lý yêu cầu đánh giá lại…
        </p>
      ) : (
        enabled && (
          <details>
            <summary>Nhận dạng lại & chấm lại</summary>
            <p>
              Gửi audio gốc đến nhà cung cấp đã chọn để nhận dạng lại (có thể
              phát sinh phí). Transcript đã nộp và lịch sử được giữ; LLM chấm
              vẫn theo cấu hình đề.
              {provider === "gemini"
                ? " Gemini dùng API key, không cần JSON; không trả độ tin cậy âm học nên kết quả cần giảng viên kiểm tra."
                : " Google Cloud STT dùng JSON service account đã upload trong Cấu hình hệ thống → STT & giọng nói."}
            </p>
            <Form
              label="Nhận dạng và chấm lại"
              onSubmit={async (d) => {
                await send(`/admin/attempts/${attempt.id}/${provider}-review`, {
                  reason: d.get("reason"),
                });
                await refresh();
              }}
            >
              <label>
                Nhà cung cấp nhận dạng lại
                <select
                  value={provider}
                  onChange={(e) =>
                    setProvider(e.target.value as "gemini" | "google")
                  }
                >
                  <option value="gemini">Gemini STT (API key)</option>
                  <option value="google">
                    Google Cloud STT (JSON service account)
                  </option>
                </select>
              </label>
              <Field label="Lý do nhận dạng / chấm lại" name="reason" />
            </Form>
          </details>
        )
      )}
      {enabled && !pending && !!attempt.grading_targets?.length && (
        <details>
          <summary>Chấm lại transcript đã nộp</summary>
          <p>
            Dùng nguyên câu trả lời đã nộp, giữ câu hỏi và rubric gốc. Chọn
            phiên bản đề có cấu hình AI phù hợp. Có thể phát sinh phí LLM; kết
            quả cần giảng viên xem lại, lịch sử cũ được giữ.
          </p>
          <Form
            label="Chấm lại transcript"
            onSubmit={async (d) => {
              await send(`/admin/attempts/${attempt.id}/grade-review`, {
                target_exam_id: d.get("target_exam_id"),
                reason: d.get("reason"),
              });
              await refresh();
            }}
          >
            <label>
              Phiên bản dùng để chấm
              <select name="target_exam_id" required>
                {attempt.grading_targets.map((target) => (
                  <option key={target.id} value={target.id}>
                    {target.name} · {target.model} · {target.id.slice(0, 8)}
                  </option>
                ))}
              </select>
            </label>
            <Field label="Lý do chấm lại" name="reason" />
          </Form>
        </details>
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
              {r.policy && (
                <p>
                  Xử lý:{" "}
                  {r.policy.provider === "grading"
                    ? "Chấm transcript đã nộp"
                    : r.policy.provider === "gemini"
                      ? "Gemini STT"
                      : r.policy.provider === "google"
                        ? "Google Cloud STT"
                        : r.policy.provider}
                </p>
              )}
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
