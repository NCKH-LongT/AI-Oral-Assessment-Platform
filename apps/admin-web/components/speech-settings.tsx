"use client";
import { useEffect, useState } from "react";
import { api, errorText, send, SpeechPolicy } from "./api";
import { Empty, Form } from "./shared";

type Settings = SpeechPolicy & {
  google_configured: boolean;
  server_model: string;
};
export default function SpeechSettings() {
  const [value, setValue] = useState<Settings | null>(null),
    [error, setError] = useState(""),
    [saved, setSaved] = useState(false);
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
          {value.google_configured
            ? "Đã gắn tệp credentials Google trên server."
            : "Google chưa cấu hình. Làm theo README để gắn credentials cho API và worker."}
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
