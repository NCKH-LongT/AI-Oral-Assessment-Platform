"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { errorText } from "./api";
import { Action } from "./shared";

export type DesktopDisplayStatus = {
  supported: boolean;
  monitors: { id: string; name: string; primary: boolean }[];
  canRestore: boolean;
  message: string;
};

export default function DesktopDisplaySettings({
  inExam,
  onBusy,
}: {
  inExam: boolean;
  onBusy: (busy: boolean) => void;
}) {
  const [status, setStatus] = useState<DesktopDisplayStatus | null>(null);
  const [keep, setKeep] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const mounted = useRef(false);
  const update = useCallback((next: DesktopDisplayStatus) => {
    if (!mounted.current) return;
    setStatus(next);
    setKeep((previous) =>
      next.monitors.some((m) => m.id === previous)
        ? previous
        : (next.monitors.find((m) => m.primary) || next.monitors[0])?.id || "",
    );
  }, []);
  const refresh = useCallback(async () => {
    if (pending.current) return;
    if (!window.oralDesktop?.displayStatus) {
      setError(
        "Mở lại OralAI Desktop bản mới để dùng nút tự tắt màn hình phụ.",
      );
      return;
    }
    pending.current = true;
    try {
      update(await window.oralDesktop.displayStatus());
      if (mounted.current) setError("");
    } finally {
      pending.current = false;
    }
  }, [update]);
  useEffect(() => {
    mounted.current = true;
    const poll = () =>
      void refresh().catch((e) => {
        if (mounted.current) setError(errorText(e));
      });
    poll();
    const timer = setInterval(poll, 5000);
    return () => {
      mounted.current = false;
      clearInterval(timer);
    };
  }, [refresh]);
  async function change(restore: boolean) {
    pending.current = true;
    setBusy(true);
    onBusy(true);
    setMessage("");
    try {
      const desktop = window.oralDesktop;
      if (!desktop?.useSingleDisplay || !desktop.restoreDisplays)
        throw new Error(
          "Mở lại OralAI Desktop bản mới để điều khiển màn hình.",
        );
      update(
        await (restore
          ? desktop.restoreDisplays()
          : desktop.useSingleDisplay(keep)),
      );
      setError("");
      setMessage(
        restore
          ? "Đã khôi phục cấu hình màn hình trước đó."
          : "Đã tắt màn hình phụ. Bấm Bắt đầu thi hoặc Khôi phục chế độ thi để tiếp tục.",
      );
    } finally {
      pending.current = false;
      setBusy(false);
      onBusy(false);
      // Also recover a backup left behind if an OS operation times out.
      void refresh().catch(() => {});
    }
  }
  return (
    <section className="notice" aria-label="Chuẩn bị màn hình">
      <h3>Chuẩn bị màn hình</h3>
      <p>
        Chọn màn hình bạn đang nhìn. OralAI có thể tạm tắt các màn hình còn lại
        trong hệ điều hành và khôi phục khi kết thúc hoặc thoát ứng dụng.
      </p>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {status?.message && <p>{status.message}</p>}
      {status?.supported && (
        <>
          <p>Hệ điều hành đang bật {status.monitors.length} màn hình.</p>
          {status.monitors.length > 1 && (
            <>
              <label htmlFor="exam-display-keep">Màn hình cần giữ</label>
              <select
                id="exam-display-keep"
                value={keep}
                disabled={busy}
                onChange={(e) => setKeep(e.target.value)}
              >
                {status.monitors.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.id} · {m.name}
                    {m.primary ? " (màn hình chính)" : ""}
                  </option>
                ))}
              </select>
              <Action disabled={busy || !keep} action={() => change(false)}>
                Tắt màn hình phụ
              </Action>
            </>
          )}
          {status.monitors.length === 1 && (
            <p>
              Đã đủ điều kiện một màn hình. Bạn có thể tiếp tục bước bắt đầu
              thi.
            </p>
          )}
        </>
      )}
      <Action className="button secondary" disabled={busy} action={refresh}>
        Kiểm tra lại màn hình
      </Action>
      {status?.canRestore && (
        <>
          <p>
            OralAI đã lưu cấu hình cũ để khôi phục. Không cần bật lại bằng tay
            sau khi nộp bài.
          </p>
          {!inExam && (
            <Action
              className="button secondary"
              disabled={busy}
              action={() => change(true)}
            >
              Khôi phục các màn hình
            </Action>
          )}
        </>
      )}
      {message && <p role="status">{message}</p>}
    </section>
  );
}
