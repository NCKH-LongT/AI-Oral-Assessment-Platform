"use client";
import { useCallback, useEffect, useState } from "react";
import { errorText } from "./api";

export const DESKTOP_STT_MODEL = "whisper-small";
type ModelId = typeof DESKTOP_STT_MODEL;
type Preferences = { language: "vi" | "en" };
export type DesktopModel = { id: ModelId; label: string; available: boolean };
const storageKey = "oral-desktop-speech-v1";
const defaults: Preferences = { language: "vi" };

export function useDesktopSpeech() {
  const [desktop, setDesktop] = useState(false);
  const [preferences, setPreferences] = useState<Preferences>(defaults);
  const [models, setModels] = useState<DesktopModel[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [storageError, setStorageError] = useState("");
  const inspect = useCallback(async () => {
    const bridge = window.oralDesktop;
    if (!bridge?.sttModels)
      throw new Error(
        "Đóng/mở lại desktop phiên bản mới để sử dụng nhận dạng giọng nói.",
      );
    const available = await bridge.sttModels();
    setModels(available);
    setReady(true);
    setError("");
    return available;
  }, []);
  useEffect(() => {
    const bridge = window.oralDesktop;
    if (!bridge) return;
    let active = true;
    void Promise.resolve().then(async () => {
      if (!active) return;
      setDesktop(true);
      try {
        const stored = JSON.parse(localStorage.getItem(storageKey) || "null");
        if (stored && ["vi", "en"].includes(stored.language))
          setPreferences({ language: stored.language });
      } catch {
        /* Invalid saved preferences fall back to Vietnamese. */
      }
      try {
        if (!bridge.sttModels)
          throw new Error(
            "Đóng/mở lại desktop phiên bản mới để sử dụng nhận dạng giọng nói.",
          );
        const available = await bridge.sttModels();
        if (active) {
          setModels(available);
          setReady(true);
        }
      } catch (e) {
        if (active) setError(errorText(e));
      }
    });
    return () => {
      active = false;
    };
  }, []);
  function update(next: Preferences) {
    setPreferences(next);
    try {
      localStorage.setItem(storageKey, JSON.stringify(next));
      setStorageError("");
    } catch {
      setStorageError(
        "Đã chọn cho lần này; không thể lưu lựa chọn cho lần mở sau.",
      );
    }
  }
  return {
    desktop,
    preferences,
    models,
    ready,
    error,
    storageError,
    update,
    inspect,
  };
}

export default function DesktopSpeechSettings({
  settings,
  disabled,
}: {
  settings: ReturnType<typeof useDesktopSpeech>;
  disabled: boolean;
}) {
  if (!settings.desktop) return null;
  const { preferences, models, ready, error, update } = settings;
  return (
    <fieldset disabled={disabled || !ready}>
      <legend>Nhận dạng giọng nói trên desktop</legend>
      <label>
        Ngôn ngữ nói
        <select
          value={preferences.language}
          onChange={(event) =>
            update({
              ...preferences,
              language: event.target.value as Preferences["language"],
            })
          }
        >
          <option value="vi">Tiếng Việt</option>
          <option value="en">Tiếng Anh</option>
        </select>
      </label>
      <p>
        Chọn ngôn ngữ chính của câu trả lời. Lựa chọn được nhớ trên thiết bị này
        cho máy chủ hiện tại.
      </p>
      <p>
        Có thể đổi ngôn ngữ rồi bấm Thử STT lại để nhận dạng lại bản ghi đã thu.
      </p>
      {!ready && !error && <p role="status">Đang kiểm tra model trên máy…</p>}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {ready &&
        !models.some(
          (model) => model.id === DESKTOP_STT_MODEL && model.available,
        ) && (
          <p role="alert">
            Chưa có bộ nhận dạng Whisper-small trên máy. Bạn vẫn có thể thi và
            nộp audio/video gốc. App bỏ qua STT; câu trả lời chưa có transcript
            hoặc điểm AI và cần giảng viên xem lại. Cài model rồi bấm Thử STT
            lại nếu muốn nhận dạng bản ghi trước khi nộp.
          </p>
        )}
      {settings.storageError && <p role="status">{settings.storageError}</p>}
    </fieldset>
  );
}
