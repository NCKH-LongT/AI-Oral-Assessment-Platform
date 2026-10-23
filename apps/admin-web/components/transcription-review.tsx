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
  const [provider, setProvider] = useState<"local" | "gemini" | "google">(
    "local",
  );
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
            · Xử lý audio: {latest.result.preprocessing} · Model chấm:{" "}
            {latest.result.assessment.model}
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
              Chạy lại toàn bộ từ audio gốc; giữ transcript đã nộp và lịch sử.
              GOPT chấm tiêu chí “Phát âm” / “Pronunciation” trong rubric tiếng
              Anh theo đúng trọng số.
              {provider === "local"
                ? " Xử lý tuần tự trên server: Whisper → Ollama → GOPT. Không gửi audio hay câu trả lời đến dịch vụ AI cloud; cần cấu hình model Ollama trên server."
                : provider === "gemini"
                  ? " Gemini dùng API key, không cần JSON; không trả độ tin cậy âm học nên kết quả cần giảng viên kiểm tra."
                  : " Google Cloud STT dùng JSON service account đã upload trong Cấu hình hệ thống → STT & giọng nói."}
              {provider !== "local" &&
                " Có thể phát sinh phí; LLM chấm theo cấu hình đề."}
            </p>
            <Form
              label="Chấm lại toàn bộ từ audio"
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
                    setProvider(e.target.value as "local" | "gemini" | "google")
                  }
                >
                  <option value="local">
                    Local: Whisper + Ollama + GOPT theo rubric
                  </option>
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
                    : r.policy.provider === "local_server"
                      ? "Local: Whisper → Ollama → GOPT theo rubric"
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
