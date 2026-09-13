"use client";
import { useEffect, useRef, useState } from "react";
import { measureNoise, type NoiseResult } from "../lib/noise-check";
import { errorText } from "./api";

export default function NoiseCheck({
  stream,
  onReady,
}: {
  stream: MediaStream;
  onReady: (ready: boolean) => void;
}) {
  const [status, setStatus] = useState<
    NoiseResult["status"] | "idle" | "checking" | "skipped" | "error"
  >("idle");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const controller = useRef<AbortController | null>(null);
  useEffect(() => {
    onReady(false);
    return () => controller.current?.abort();
  }, [onReady]);

  async function check() {
    controller.current?.abort();
    const current = new AbortController();
    controller.current = current;
    onReady(false);
    setStatus("checking");
    setProgress(0);
    setError("");
    try {
      const result = await measureNoise(
        stream.getAudioTracks()[0]?.getSettings().deviceId,
        current.signal,
        (percent) => {
          if (!current.signal.aborted) setProgress(percent);
        },
      );
      if (current.signal.aborted) return;
      setStatus(result.status);
      onReady(result.status === "quiet");
    } catch (e) {
      if (current.signal.aborted) return;
      setStatus("error");
      setError(errorText(e));
    }
  }

  return (
    <section className="noise-check" aria-label="Kiểm tra độ ồn">
      <h3>Kiểm tra độ ồn môi trường</h3>
      <p>
        Giữ im lặng và tắt loa trong 5 giây để đo tiếng ồn xung quanh. Âm thanh
        kiểm tra chỉ được xử lý trên máy, không lưu hoặc tải lên.
      </p>
      <p role="status" aria-live="polite">
        {status === "idle" &&
          "Kiểm tra độ ồn trước khi bắt đầu, hoặc chọn bỏ qua."}
        {status === "checking" &&
          `Đang đo tiếng ồn… ${progress}% — vui lòng giữ im lặng.`}
        {status === "quiet" &&
          "Môi trường đủ yên lặng. Bạn có thể bắt đầu thi."}
        {status === "noisy" &&
          "Môi trường quá ồn. Vui lòng tìm chỗ yên lặng hơn rồi kiểm tra lại, hoặc bỏ qua để tiếp tục thi."}
        {status === "no_signal" &&
          "Không nhận được tín hiệu microphone. Kiểm tra nút tắt tiếng và thiết bị rồi thử lại."}
        {status === "skipped" &&
          "Bạn đã bỏ qua kiểm tra độ ồn. Hãy chọn nơi yên lặng để câu trả lời rõ hơn."}
      </p>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {status === "checking" && (
        <progress aria-label="Tiến độ đo tiếng ồn" max={100} value={progress} />
      )}
      <div className="inline">
        <button
          type="button"
          className="button secondary"
          disabled={status === "checking"}
          onClick={() => void check()}
        >
          {status === "idle" ? "Kiểm tra độ ồn" : "Kiểm tra lại độ ồn"}
        </button>
        <button
          type="button"
          className="text-button"
          disabled={status === "skipped"}
          onClick={() => {
            controller.current?.abort();
            setError("");
            setStatus("skipped");
            onReady(true);
          }}
        >
          Bỏ qua kiểm tra độ ồn
        </button>
      </div>
      <p className="muted">
        Kết quả mang tính tham khảo, phụ thuộc độ nhạy microphone. Bỏ qua bước
        này vẫn cần cấp quyền camera và mic.
      </p>
    </section>
  );
}
