"use client";
import { useEffect, useRef, useState } from "react";
import { errorText } from "./api";

export type CorrectionStatus = {
  installed: boolean;
  busy: boolean;
  phase: string;
  progress: number;
  model: string;
  bytes: number;
};
export type CorrectionBridge = {
  status: () => Promise<CorrectionStatus>;
  install: () => Promise<CorrectionStatus>;
  cancel: () => Promise<void>;
  suggest: (text: string) => Promise<{ text: string; model: string }>;
};

export default function TranscriptCorrection({
  text,
  disabled,
  onApply,
  onBusy,
}: {
  text?: string;
  disabled: boolean;
  onApply?: (text: string) => void;
  onBusy: (busy: boolean) => void;
}) {
  const [status, setStatus] = useState<CorrectionStatus | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [proposal, setProposal] = useState<{
    original: string;
    text: string;
  } | null>(null);
  const active = useRef(true);
  const ownRequest = useRef(false);
  const bridge =
    typeof window !== "undefined" ? window.oralDesktop?.correction : undefined;
  useEffect(() => {
    active.current = true;
    if (!bridge) return;
    const refresh = () =>
      bridge
        .status()
        .then((s) => {
          if (active.current) setStatus(s);
        })
        .catch((e) => {
          if (active.current) setError(errorText(e));
        });
    void refresh();
    const timer = setInterval(refresh, 1000);
    return () => {
      active.current = false;
      clearInterval(timer);
      if (ownRequest.current) void bridge.cancel();
    };
  }, [bridge]);
  if (!bridge) return null;
  const suggestion = proposal?.original === text ? proposal : null;
  async function run(install: boolean) {
    if (!bridge || ownRequest.current) return;
    ownRequest.current = true;
    setPending(true);
    onBusy(true);
    setError("");
    setProposal(null);
    try {
      if (install) await bridge.install();
      else {
        const original = text!;
        const result = await bridge.suggest(original);
        if (active.current) setProposal({ original, text: result.text });
      }
    } catch (e) {
      if (active.current) setError(errorText(e));
    } finally {
      ownRequest.current = false;
      if (active.current) {
        setPending(false);
        onBusy(false);
        void bridge
          .status()
          .then(setStatus)
          .catch(() => {});
      }
    }
  }
  const phase =
    {
      downloading: `Đang tải model: ${status?.progress || 0}%`,
      verifying: "Đang kiểm tra model…",
      loading: "Đang nạp model local…",
      correcting: `Đang gợi ý sửa chính tả: ${status?.progress || 0}%`,
    }[status?.phase || ""] || "Đang chuẩn bị…";
  return (
    <section className="transcript-correction" aria-label="Sửa chính tả local">
      <h3>Sửa chính tả local</h3>
      <p className="muted">
        Model Qwen3 1.7B tải một lần (1,28 GB), sau đó dùng offline. Đoạn văn
        không gửi lên server để sửa. Luôn đọc lại vì model có thể sửa sai thuật
        ngữ.
      </p>
      {!status?.installed ? (
        <button
          type="button"
          className="button secondary"
          disabled={disabled || pending || !status || status.busy}
          onClick={() => void run(true)}
        >
          Tải model sửa chính tả (1,28 GB)
        </button>
      ) : text === undefined ? (
        <p>Model đã sẵn sàng. Bạn có thể dùng sau khi ghi câu trả lời.</p>
      ) : (
        <button
          type="button"
          className="button secondary"
          disabled={
            disabled ||
            pending ||
            status.busy ||
            !text.trim() ||
            text.length > 12000
          }
          onClick={() => void run(false)}
        >
          Gợi ý sửa chính tả
        </button>
      )}
      {text && text.length > 12000 && (
        <p className="muted">Sửa local hỗ trợ tối đa 12.000 ký tự mỗi lần.</p>
      )}
      {pending && (
        <div>
          <p role="status">{phase}</p>
          <button
            type="button"
            className="text-button"
            onClick={() =>
              void bridge.cancel().catch((e) => setError(errorText(e)))
            }
          >
            Hủy xử lý local
          </button>
        </div>
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {suggestion && (
        <div className="correction-comparison">
          <label>
            Bản trước khi sửa
            <textarea readOnly value={suggestion.original} rows={4} />
          </label>
          <label>
            Bản đề xuất
            <textarea readOnly value={suggestion.text} rows={4} />
          </label>
          {suggestion.text === suggestion.original ? (
            <p>Model không đề xuất thay đổi.</p>
          ) : (
            <button
              type="button"
              className="button secondary"
              disabled={disabled || pending}
              onClick={() => {
                onApply?.(suggestion.text);
                setProposal(null);
              }}
            >
              Áp dụng bản đề xuất
            </button>
          )}
          <button
            type="button"
            className="text-button"
            disabled={disabled || pending}
            onClick={() => setProposal(null)}
          >
            Giữ bản hiện tại
          </button>
        </div>
      )}
    </section>
  );
}
