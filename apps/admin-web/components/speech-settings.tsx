"use client";
import { useEffect, useState } from "react";
import { api, errorText, send, SpeechPolicy } from "./api";
import { Empty, Form } from "./shared";

type Settings = SpeechPolicy & {
  google_configured: boolean;
  google_credentials: {
    status: "ready" | "missing" | "unreadable" | "invalid";
    source: "upload" | "environment" | "none";
    project_id?: string;
    client_email?: string;
  };
  server_model: string;
};
export default function SpeechSettings() {
  const [value, setValue] = useState<Settings | null>(null),
    [error, setError] = useState(""),
    [saved, setSaved] = useState(false),
    [uploaded, setUploaded] = useState(false);
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
        Áp dụng cho lần nhận dạng tiếp theo trên web và desktop. Audio/video gốc
        luôn được lưu để đối chiếu.
      </p>
      <section className="panel">
        <h2>Credentials Google Cloud</h2>
        <p role="status">
          {
            {
              ready: "Đọc được credentials hợp lệ",
              missing: "Chưa tìm thấy file credentials",
              unreadable: "Không đọc được file credentials",
              invalid: "File credentials không hợp lệ",
            }[value.google_credentials.status]
          }
        </p>
        {value.google_configured && (
          <p style={{ overflowWrap: "anywhere" }}>
            Project: <strong>{value.google_credentials.project_id}</strong>
            <br />
            Tài khoản: {value.google_credentials.client_email}
            <br />
            Nguồn:{" "}
            {value.google_credentials.source === "upload"
              ? "Upload từ admin, lưu trong hệ thống"
              : "File cấu hình trên máy chủ"}
          </p>
        )}
        <Form
          label={
            value.google_configured
              ? "Thay file JSON Google"
              : "Upload JSON Google"
          }
          onSubmit={async (d) => {
            setUploaded(false);
            const file = d.get("file");
            if (!(file instanceof File) || !file.size || file.size > 64 * 1024)
              throw new Error("Chọn file JSON có nội dung, tối đa 64 KB.");
            setValue(
              await api<Settings>("/admin/settings/speech/google-credentials", {
                method: "POST",
                body: d,
              }),
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
          <p className="muted">
            File được lưu riêng để API và worker cùng dùng, giữ lại khi khởi
            động lại Docker. JSON lỗi sẽ không thay thế file đang hoạt động.
            Khóa bí mật không được hiển thị hoặc tải xuống từ web.
          </p>
        </Form>
        {uploaded && (
          <p role="status">
            Đã lưu credentials Google. Không cần khởi động lại API hoặc worker.
          </p>
        )}
        <p className="muted">
          Trạng thái trên kiểm tra file và private key. Google Cloud vẫn cần bật
          Speech-to-Text API, billing và cấp quyền phù hợp. Upload file không
          đổi nhà cung cấp STT đã chọn.
        </p>
      </section>
      <Form
        label="Lưu cấu hình STT"
        onSubmit={async (d) => {
          setSaved(false);
          setValue(
            await send<Settings>(
              "/admin/settings/speech",
              {
                provider: d.get("provider"),
                preprocessing: d.get("preprocessing"),
                language: d.get("language"),
              },
              "PUT",
            ),
          );
          setSaved(true);
        }}
      >
        <label>
          Nhà cung cấp STT
          <select name="provider" defaultValue={value.provider}>
            <option value="local_server">Whisper trên server nội bộ</option>
            <option value="local">
              Whisper local trên máy sinh viên (desktop)
            </option>
            <option value="google" disabled={!value.google_configured}>
              Google Cloud Speech-to-Text
            </option>
          </select>
        </label>
        <label>
          Xử lý audio trước STT
          <select name="preprocessing" defaultValue={value.preprocessing}>
            <option value="denoise">
              Lọc nhiễu, ưu tiên dải giọng nói và chuẩn hóa âm lượng
            </option>
            <option value="off">
              Chỉ chuyển WAV mono 16 kHz, không lọc nhiễu
            </option>
          </select>
        </label>
        <label>
          Ngôn ngữ nhận dạng
          <select name="language" defaultValue={value.language}>
            <option value="vi">Tiếng Việt</option>
            <option value="en">Tiếng Anh</option>
          </select>
        </label>
        <p className="muted">
          Lọc nhiễu không bảo đảm loại bỏ tiếng nói chồng của người khác. Mỗi
          câu tối đa 10 phút, audio tối đa 30 MB khi nhận dạng.
        </p>
        <p className="muted">
          Server nội bộ: model {value.server_model}.{" "}
          {!value.google_configured &&
            "Upload JSON Google ở phía trên để sử dụng Google STT."}
        </p>
        <p className="muted">
          Khi chọn Google, bản audio dùng nhận dạng được gửi tới Google Cloud và
          có thể phát sinh phí. Chấm điểm vẫn theo cấu hình AI và rubric đã cố
          định của đề thi.
        </p>
      </Form>
      {saved && <p role="status">Đã lưu cấu hình STT.</p>}
    </section>
  );
}
