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
  const [recording, setRecording] = useState<{
    raw: string;
    filtered?: string;
  } | null>(null);
  const [listenFiltered, setListenFiltered] = useState(false);
  const urls = useRef<string[]>([]);
  const playback = useRef<HTMLAudioElement>(null);
  const playbackPanel = useRef<HTMLDivElement>(null);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => {
    onReady(false);
    return () => {
      controller.current?.abort();
      urls.current.forEach(URL.revokeObjectURL);
    };
  }, [onReady]);

  useEffect(() => {
    if (recording) playbackPanel.current?.scrollIntoView({ block: "nearest" });
  }, [recording]);

  async function check() {
    controller.current?.abort();
    playback.current?.pause();
    urls.current.forEach(URL.revokeObjectURL);
    urls.current = [];
    setRecording(null);
    setListenFiltered(false);
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
      const raw = URL.createObjectURL(result.rawAudio);
      const filtered = result.filteredAudio
        ? URL.createObjectURL(result.filteredAudio)
        : undefined;
      urls.current = [raw, ...(filtered ? [filtered] : [])];
      setRecording({ raw, filtered });
      if (result.filterError) setError(result.filterError);
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
        Thu thử 10 giây: giữ im lặng trong 3 giây đầu để đo tiếng ồn, sau đó nói
        thử trong 7 giây. Bạn có thể phát lại và bật/tắt lọc nhiễu để so sánh.
        Bản thử chỉ giữ tạm trên máy, không gửi lên server.
      </p>
      <p role="status" aria-live="polite">
        {status === "idle" &&
          "Kiểm tra độ ồn trước khi bắt đầu, hoặc chọn bỏ qua."}
        {status === "checking" &&
          `Đang thu thử… ${progress}% — ${progress <= 30 ? "vui lòng giữ im lặng." : "hãy nói thử vào mic."}`}
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
      <div className="panel" ref={playbackPanel}>
        <h4>Nghe lại bản ghi kiểm tra</h4>
        <label className="check">
          <input
            type="checkbox"
            checked={listenFiltered}
            disabled={!recording?.filtered}
            onChange={(event) => {
              playback.current?.pause();
              setListenFiltered(event.target.checked);
            }}
          />
          Nghe bản đã lọc nhiễu RNNoise
        </label>
        {!recording ? (
          <p>
            {status === "checking"
              ? "Đang thu thử. Bản gốc và bản lọc sẽ sẵn sàng khi thu xong 10 giây."
              : "Bấm Kiểm tra độ ồn và thu đủ 10 giây để nghe lại bản gốc hoặc bản đã lọc nhiễu."}
          </p>
        ) : (
          <>
            <p>
              Đã thu xong.{" "}
              {listenFiltered
                ? "Đang chọn bản lọc nhiễu."
                : "Đang chọn bản gốc."}
            </p>
            <audio
              ref={playback}
              controls
              preload="metadata"
              aria-label="Phát lại kiểm tra mic"
              src={
                listenFiltered && recording.filtered
                  ? recording.filtered
                  : recording.raw
              }
            />
            <button
              type="button"
              className="button secondary"
              onClick={() => {
                void playback.current
                  ?.play()
                  .catch(() =>
                    setError(
                      "Không phát được bản ghi. Hãy kiểm tra thiết bị phát âm thanh hoặc thu lại.",
                    ),
                  );
              }}
            >
              {listenFiltered ? "Phát bản đã lọc nhiễu" : "Phát bản gốc"}
            </button>
          </>
        )}
      </div>
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
