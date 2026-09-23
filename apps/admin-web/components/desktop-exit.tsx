"use client";
import { useState, useSyncExternalStore } from "react";
import { errorText } from "./api";

const subscribe = () => () => {};
export default function DesktopExit() {
  const desktop = useSyncExternalStore(
    subscribe,
    () => !!window.oralDesktop?.quit,
    () => false,
  );
  const [error, setError] = useState("");
  if (!desktop) return null;
  return (
    <div>
      <button
        type="button"
        className="button secondary"
        onClick={() => {
          setError("");
          void window.oralDesktop
            ?.quit?.()
            .catch((e) => setError(errorText(e)));
        }}
      >
        Thoát ứng dụng
      </button>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
    </div>
  );
}
