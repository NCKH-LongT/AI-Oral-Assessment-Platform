"use client";
import { useEffect, useState } from "react";
import { api, errorText, send, SpeechPolicy } from "./api";
import { Empty, Form } from "./shared";

type Settings = SpeechPolicy & { server_model: string };
export default function SpeechSettings() {
  const [value, setValue] = useState<Settings | null>(null);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    api<Settings>("/admin/settings/speech")
      .then(setValue)
      .catch((e) => setError(errorText(e)));
  }, []);
  if (!value) return <Empty>{error || "Đang tải cấu hình STT…"}</Empty>;
  return (
    <section className="panel">
      <h1>Cấu hình giọng nói</h1>
      <p>
        Desktop luôn dùng PhoWhisper-small cục bộ kèm bộ cài. Người dùng bật/tắt
        RNNoise và nghe thử mic trước khi thi. Server nhận media gốc và
        transcript để chấm.
      </p>
      <Form
        label="Lưu cấu hình STT"
        onSubmit={async () => {
          setSaved(false);
          const next = await send<Settings>(
            "/admin/settings/speech",
            {
              provider: value.provider,
              language: value.language,
              preprocessing: "off",
            },
            "PUT",
          );
          setValue(next);
          setSaved(true);
        }}
      >
        <label>
          Nhà cung cấp STT cho trình duyệt web
          <select
            value={value.provider}
            onChange={(e) => {
              setValue({
                ...value,
                provider: e.target.value as SpeechPolicy["provider"],
              });
              setSaved(false);
            }}
          >
            <option value="local">Yêu cầu dùng desktop (STT local)</option>
            <option value="local_server">Whisper trên server nội bộ</option>
            {value.provider === "google" && (
              <option value="google">Google Cloud STT (cấu hình cũ)</option>
            )}
          </select>
        </label>
        <label>
          Ngôn ngữ nhận dạng
          <select
            value={value.language}
            onChange={(e) => {
              setValue({
                ...value,
                language: e.target.value as SpeechPolicy["language"],
              });
              setSaved(false);
            }}
          >
            <option value="vi">Tiếng Việt</option>
            <option value="en">Tiếng Anh</option>
          </select>
        </label>
        <p>
          Whisper server: {value.server_model}. Chọn LLM chấm bài riêng trong
          cấu hình AI. Không cần JSON Google cho PhoWhisper hoặc Gemini.
        </p>
      </Form>
      {saved && <p role="status">Đã lưu cấu hình STT.</p>}
      <p>
        Giảng viên quản trị có thể yêu cầu nhận dạng lại bằng Gemini tại trang
        xem bài. GEMINI_API_KEY và GEMINI_STT_MODEL được cấu hình trên server.
      </p>
    </section>
  );
}
