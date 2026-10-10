"use client";
import { useEffect, useRef, useState } from "react";
import { api, send, errorText, clientBackend, type User } from "./api";
export default function GoogleLogin({
  onLogin,
}: {
  onLogin: (user: User) => void;
}) {
  const [enabled, setEnabled] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const run = useRef<AbortController | null>(null);
  useEffect(() => {
    const blockSwitch = (event: Event) => {
      if (busy) event.preventDefault();
    };
    window.addEventListener("oral:backend-switch", blockSwitch);
    return () => window.removeEventListener("oral:backend-switch", blockSwitch);
  }, [busy]);
  useEffect(() => {
    api<{ enabled: boolean }>("/auth/google/config")
      .then((r) => setEnabled(r.enabled))
      .catch(() => {});
    if (new URLSearchParams(location.search).has("login_error")) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Read the OAuth callback error from the browser URL after hydration.
      setError("Đăng nhập Google chưa thành công. Vui lòng thử lại.");
      history.replaceState({}, "", location.pathname);
    }
    return () => run.current?.abort();
  }, []);
  if (!enabled) return null;
  async function login() {
    if (!window.oralDesktop?.openGoogle && !clientBackend) {
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- Full navigation is required for the OAuth redirect and state cookie.
      location.assign("/api/auth/google/start");
      return;
    }
    const current = new AbortController();
    run.current?.abort();
    run.current = current;
    setBusy(true);
    setError("");
    // Local browser clients use the existing polling flow so the HTTPS OAuth
    // callback stays on the selected backend, while login completes locally.
    const popup = !window.oralDesktop?.openGoogle
      ? window.open("about:blank", "_blank")
      : null;
    try {
      if (!window.oralDesktop?.openGoogle && !popup)
        throw new Error("Cho phép cửa sổ bật lên để đăng nhập Google.");
      const flow = await send<{
        flow_id: string;
        poll_token: string;
        url: string;
      }>("/auth/google/desktop");
      if (current.signal.aborted) return;
      if (window.oralDesktop?.openGoogle)
        await window.oralDesktop.openGoogle(flow.url);
      else if (popup && clientBackend) {
        const target = new URL(flow.url);
        if (
          target.origin !== clientBackend.urls[clientBackend.mode] ||
          target.pathname !== "/api/auth/google/start" ||
          !target.searchParams.get("flow_id") ||
          target.username ||
          target.password ||
          target.hash
        )
          throw new Error("Domain đăng nhập chưa khớp backend đã chọn.");
        popup.opener = null;
        popup.location.href = target.href;
      }
      const deadline = Date.now() + 300000;
      while (!current.signal.aborted && Date.now() < deadline) {
        const result = await api<{ pending: boolean; user?: User }>(
          "/auth/google/poll",
          {
            method: "POST",
            body: JSON.stringify({
              flow_id: flow.flow_id,
              poll_token: flow.poll_token,
            }),
            signal: current.signal,
          },
        );
        if (result.user && !current.signal.aborted) {
          onLogin(result.user);
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
      if (!current.signal.aborted)
        setError("Phiên đăng nhập đã hết hạn. Vui lòng thử lại.");
    } catch (e) {
      if (!current.signal.aborted) setError(errorText(e));
    } finally {
      popup?.close();
      if (!current.signal.aborted) setBusy(false);
    }
  }
  return (
    <div className="google-login">
      <button
        type="button"
        className="button secondary"
        disabled={busy}
        onClick={() => void login()}
      >
        {busy
          ? "Đang chờ đăng nhập trong trình duyệt…"
          : "Đăng nhập bằng Google"}
      </button>
      {busy && (
        <button
          type="button"
          className="text-button"
          onClick={() => {
            run.current?.abort();
            setBusy(false);
          }}
        >
          Hủy đăng nhập Google
        </button>
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
    </div>
  );
}
