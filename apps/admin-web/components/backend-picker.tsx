"use client";
import { useEffect, useRef, useState } from "react";
import { configureClientBackend, errorText } from "./api";

export type ClientBackend = {
  mode: "local" | "online";
  urls: { local: string; online: string };
};

export default function BackendPicker({
  config,
  children,
}: {
  config: ClientBackend;
  children: React.ReactNode;
}) {
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const container = useRef<HTMLDivElement>(null);
  const bar = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!bar.current) return;
    const observer = new ResizeObserver(() => {
      container.current?.style.setProperty(
        "--backend-bar-height",
        `${Math.ceil(bar.current?.getBoundingClientRect().height || 58)}px`,
      );
    });
    observer.observe(bar.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    configureClientBackend(config);
    // Configure API requests before mounting the login/exam UI.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Initialize local client routing before children fetch data.
    setReady(true);
  }, [config]);

  async function change(mode: ClientBackend["mode"]) {
    if (mode === config.mode) return;
    if (
      !window.dispatchEvent(
        new Event("oral:backend-switch", { cancelable: true }),
      )
    ) {
      setError("Hãy hoàn tất ghi âm và nộp câu trả lời trước khi đổi backend.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/client-backend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode }),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error?.message || "Không đổi được backend.");
      window.location.reload();
    } catch (e) {
      setError(errorText(e));
      setBusy(false);
    }
  }

  return (
    <div className="local-client" ref={container}>
      <section className="backend-picker" aria-label="Chọn backend" ref={bar}>
        <strong>Backend</strong>
        <div
          className="backend-options"
          role="group"
          aria-label="Chế độ backend"
        >
          {(["local", "online"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              aria-pressed={config.mode === mode}
              disabled={busy}
              onClick={() => void change(mode)}
            >
              {mode === "local" ? "Local" : "Online"}
            </button>
          ))}
        </div>
        <span className="backend-address">{config.urls[config.mode]}</span>
        <span className="backend-hint">
          {busy
            ? "Đang kiểm tra kết nối…"
            : "Phiên đăng nhập riêng cho mỗi backend"}
        </span>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
      </section>
      {ready ? (
        <div inert={busy}>{children}</div>
      ) : (
        <p className="loading">Đang kết nối…</p>
      )}
    </div>
  );
}
