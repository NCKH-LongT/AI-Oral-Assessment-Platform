"use client";
import { useCallback, useEffect, useState } from "react";
import { api, clientBackend, errorText, type SpeechPolicy } from "./api";

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
  const [downloadAllowed, setDownloadAllowed] = useState(false);
  const [downloading, setDownloading] = useState(false);
  useEffect(() => {
    if (window.oralDesktop)
      api<SpeechPolicy>("/stt/config")
        .then((policy) => setDownloadAllowed(!!policy.desktop_download_allowed))
        .catch(() => setDownloadAllowed(false));
  }, []);
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
  async function download() {
    setDownloading(true);
    setError("");
    try {
      if (!window.oralDesktop?.downloadModel)
        throw new Error("Cập nhật ứng dụng desktop để tải model.");
      await window.oralDesktop.downloadModel(clientBackend?.mode || "online");
      await inspect();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setDownloading(false);
    }
  }
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
    downloadAllowed,
    downloading,
    download,
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
    <fieldset disabled={disabled || settings.downloading}>
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
      {ready &&
        !models.some((model) => model.available) &&
        (settings.downloadAllowed ? (
          <button type="button" onClick={() => void settings.download()}>
            {settings.downloading
              ? "Đang tải và kiểm tra Whisper…"
              : "Tải Whisper-small (~464 MiB)"}
          </button>
        ) : (
          <p>
            Admin chưa cho phép tải Whisper trên desktop. Bài thi được xử lý
            trên server.
          </p>
        ))}
      {settings.storageError && <p role="status">{settings.storageError}</p>}
    </fieldset>
  );
}
