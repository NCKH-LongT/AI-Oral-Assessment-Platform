"use client";
import { useEffect, useState } from "react";
import { api, errorText, send, SpeechPolicy } from "./api";
import { Empty, Form } from "./shared";

type Settings = SpeechPolicy & {
  server_model: string;
  gemini_configured: boolean;
  gemini_model: string;
  google_configured: boolean;
  google_credentials: {
    status: "ready" | "missing" | "unreadable" | "invalid";
    source: string;
    project_id?: string;
    client_email?: string;
  };
};
export default function SpeechSettings() {
  const [value, setValue] = useState<Settings | null>(null);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [uploaded, setUploaded] = useState(false);
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
            <option value="gemini">Gemini STT (API key)</option>
            <option value="google">
              Google Cloud STT (JSON service account)
            </option>
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
        Khi xem bài, admin chọn Gemini hoặc Google Cloud STT cho từng lần nhận
        dạng lại. Lựa chọn này độc lập với LLM chấm bài và STT local của
        desktop.
      </p>
      <h2>Gemini STT</h2>
      <p>
        {value.gemini_configured
          ? "Đã cấu hình Gemini API key."
          : "Chưa cấu hình Gemini API key."}{" "}
        Model: {value.gemini_model || "Theo cấu hình server"}. Đặt
        GEMINI_API_KEY và GEMINI_STT_MODEL trong .env của server rồi tạo lại
        API/worker. Không cần JSON Google. Gemini không trả độ tin cậy âm học
        nên transcript cần kiểm tra.
      </p>
      <details>
        <summary>Google Cloud STT — cấu hình JSON service account</summary>
        <p>
          Chỉ cần khi chọn Google Cloud STT. Bật Speech-to-Text API, billing và
          cấp quyền nhận dạng cho service account của dự án Google Cloud.
        </p>
        <p role="status">
          {value.google_credentials?.status === "ready"
            ? "Đã đọc được JSON Google hợp lệ."
            : value.google_credentials?.status === "invalid"
              ? "JSON Google không hợp lệ. Hãy upload lại."
              : value.google_credentials?.status === "unreadable"
                ? "Không đọc được JSON Google. Kiểm tra quyền file hoặc upload lại."
                : "Chưa có JSON Google."}
        </p>
        {value.google_configured && (
          <p>Project: {value.google_credentials.project_id}</p>
        )}
        <Form
          label="Upload JSON Google STT"
          onSubmit={async (data) => {
            setUploaded(false);
            const file = data.get("file");
            if (!(file instanceof File) || !file.size || file.size > 64 * 1024)
              throw new Error("Chọn file JSON có nội dung, tối đa 64 KB.");
            const result = await api<Settings>(
              "/admin/settings/speech/google-credentials",
              {
                method: "POST",
                body: data,
              },
            );
            setValue(
              (current) =>
                current && {
                  ...current,
                  google_configured: result.google_configured,
                  google_credentials: result.google_credentials,
                },
            );
            setUploaded(true);
          }}
        >
          <label>
            File JSON service account Google (tối đa 64 KB)
            <input
              type="file"
              name="file"
              accept=".json,application/json"
              required
            />
          </label>
        </Form>
        {uploaded && (
          <p role="status">
            Đã lưu JSON Google. Không thay đổi lựa chọn STT; bấm Lưu cấu hình
            STT nếu cần.
          </p>
        )}
        <p>
          JSON chỉ lưu trên server, không gửi xuống desktop. File hợp lệ chưa
          xác nhận quyền API, billing hoặc quota; upload không tự bật Google
          STT.
        </p>
      </details>
    </section>
  );
}
