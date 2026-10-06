"use client";
import { useEffect, useState } from "react";
import { errorText } from "./api";

type ModelId = "phowhisper-small" | "whisper-small";
type Preferences = { model: ModelId; language: "vi" | "en" };
export type DesktopModel = { id: ModelId; label: string; available: boolean };
const storageKey = "oral-desktop-speech-v1";
const defaults: Preferences = { model: "phowhisper-small", language: "vi" };

export function useDesktopSpeech() {
  const [desktop, setDesktop] = useState(false);
  const [preferences, setPreferences] = useState<Preferences>(defaults);
  const [models, setModels] = useState<DesktopModel[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [storageError, setStorageError] = useState("");
  useEffect(() => {
    const bridge = window.oralDesktop;
    if (!bridge) return;
    let active = true;
    void Promise.resolve().then(async () => {
      if (!active) return;
      setDesktop(true);
      try {
        const stored = JSON.parse(localStorage.getItem(storageKey) || "null");
        if (
          stored &&
          ["phowhisper-small", "whisper-small"].includes(stored.model) &&
          ["vi", "en"].includes(stored.language)
        )
          setPreferences({ model: stored.model, language: stored.language });
      } catch {
        /* Invalid saved preferences fall back to Vietnamese/PhoWhisper. */
      }
      try {
        if (!bridge.sttModels)
          throw new Error(
            "Đóng/mở lại desktop phiên bản mới để chọn model và ngôn ngữ.",
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
  return { desktop, preferences, models, ready, error, storageError, update };
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
      <label>
        Model nhận dạng
        <select
          value={preferences.model}
          onChange={(event) =>
            update({ ...preferences, model: event.target.value as ModelId })
          }
        >
          {(
            [
              ["phowhisper-small", "PhoWhisper-small"],
              ["whisper-small", "Whisper-small (đa ngôn ngữ)"],
            ] as const
          ).map(([id, label]) => {
            const available = models.some(
              (model) => model.id === id && model.available,
            );
            return (
              <option key={id} value={id} disabled={!available}>
                {label}
                {ready && !available ? " — chưa cài" : ""}
              </option>
            );
          })}
        </select>
      </label>
      <p>
        PhoWhisper ưu tiên tiếng Việt; Whisper-small hỗ trợ nhiều ngôn ngữ. Chọn
        ngôn ngữ chính của câu trả lời. Lựa chọn được nhớ trên thiết bị này cho
        máy chủ hiện tại.
      </p>
      <p>
        Đổi lựa chọn rồi bấm Thử STT lại để áp dụng cho bản ghi đã thu;
        transcript hiện tại được giữ đến khi nhận dạng lại thành công.
      </p>
      {!ready && !error && <p role="status">Đang kiểm tra model trên máy…</p>}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {ready &&
        !models.some(
          (model) => model.id === preferences.model && model.available,
        ) && (
          <p role="alert">
            Model đã chọn chưa có trên máy. Chọn model đã cài hoặc cập nhật bộ
            OralAI đầy đủ.
          </p>
        )}
      {settings.storageError && <p role="status">{settings.storageError}</p>}
    </fieldset>
  );
}
