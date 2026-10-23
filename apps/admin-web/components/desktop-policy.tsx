"use client";
import { useEffect, useState } from "react";
import { api, send, errorText } from "./api";
import { Empty, Form } from "./shared";

export const desktopRules = {
  require_screen: [
    "Ghi toàn màn hình",
    "Ghi màn hình trong lúc làm bài và yêu cầu tải minh chứng trước khi nộp. Nếu dùng nhiều màn hình, ghi màn hình chứa cửa sổ ứng dụng khi bắt đầu chia sẻ.",
  ],
  require_camera: [
    "Bắt buộc camera",
    "Yêu cầu camera để hiển thị trên màn hình thi. Khung camera nằm trong video màn hình khi bật ghi màn hình; không lưu video riêng từng câu. Khi tắt, chỉ yêu cầu microphone.",
  ],
  single_display: [
    "Chỉ dùng một màn hình",
    "Kiểm tra số màn hình hệ điều hành đang bật khi bắt đầu hoặc khôi phục thi.",
  ],
  kiosk: [
    "Khóa toàn màn hình (kiosk)",
    "Bật kiosk và không cho thu nhỏ cửa sổ trong chế độ thi.",
  ],
  block_shortcuts: [
    "Chặn phím tắt khi thi",
    "Chặn tải lại, đóng cửa sổ, đổi trang và thoát toàn màn hình bằng phím tắt do ứng dụng xử lý.",
  ],
  block_clipboard: [
    "Chặn clipboard khi thi",
    "Chặn sao chép, cắt, dán, kéo thả và menu chuột phải trong bài thi.",
  ],
  block_navigation: [
    "Chặn điều hướng khi thi",
    "Chặn chuyển trang trong cửa sổ thi. Địa chỉ bên ngoài và cửa sổ mới luôn bị giới hạn bởi ứng dụng.",
  ],
  block_downloads: [
    "Chặn tải xuống khi thi",
    "Chặn tải tệp từ cửa sổ thi; việc gửi minh chứng lên server vẫn hoạt động.",
  ],
  pause_on_focus_loss: [
    "Tạm dừng trả lời khi rời cửa sổ",
    "Dừng bản ghi câu trả lời khi chuyển cửa sổ, thu nhỏ hoặc rời toàn màn hình. Đồng hồ thi vẫn chạy; sự kiện luôn được ghi nhận.",
  ],
  block_devtools: [
    "Chặn công cụ nhà phát triển",
    "Chặn F12/Ctrl+Shift+I/J/C từ khi mở app. Khi tắt, các phím này mở hoặc đóng DevTools.",
  ],
} as const;
export type DesktopPolicy = Record<keyof typeof desktopRules, boolean>;
const entries = Object.entries(desktopRules) as [
  keyof DesktopPolicy,
  readonly [string, string],
][];

export function DesktopPolicySummary({ rules }: { rules?: DesktopPolicy }) {
  const [live, setLive] = useState<DesktopPolicy | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    if (rules) return;
    let active = true;
    api<{ rules: DesktopPolicy }>("/desktop/policy")
      .then((data) => {
        if (active) setLive(data.rules);
      })
      .catch((e) => {
        if (active) setError(errorText(e));
      });
    return () => {
      active = false;
    };
  }, [rules]);
  const values = rules || live;
  return (
    <section className="panel">
      <h2>Quy định ứng dụng desktop</h2>
      <p>
        Khi mở app, bạn có thể đăng nhập và xem bài thi. Camera, ghi màn hình và
        khóa chế độ thi chỉ bắt đầu ở bước chuẩn bị hoặc bắt đầu bài thi.
      </p>
      {values ? (
        <details>
          <summary>
            Xem quy định {rules ? "của lượt thi này" : "cho lượt thi mới"}
          </summary>
          <ul>
            {entries.map(([key, [label, description]]) => (
              <li key={key}>
                <strong>
                  {values[key] ? "Bật" : "Tắt"} · {label}
                </strong>
                : {description}
              </li>
            ))}
          </ul>
        </details>
      ) : (
        <p role="status">{error || "Đang tải quy định…"}</p>
      )}
      <p className="muted">
        Microphone và kết nối server vẫn cần thiết. Các quy định được chốt khi
        tạo lượt thi. Thay đổi màn hình khi đang ghi hoặc dừng chia sẻ cần khôi
        phục bản ghi; thời gian thi vẫn chạy. Quyền thiết bị do hệ điều hành
        cấp.
      </p>
    </section>
  );
}

export default function DesktopPolicySettings() {
  const [rules, setRules] = useState<DesktopPolicy | null>(null);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    api<{ rules: DesktopPolicy }>("/admin/settings/desktop")
      .then((data) => setRules(data.rules))
      .catch((e) => setError(errorText(e)));
  }, []);
  if (!rules) return <Empty>{error || "Đang tải quy định desktop…"}</Empty>;
  return (
    <section className="panel">
      <h2>Quy định desktop</h2>
      <p>
        Áp dụng cho lượt thi tạo sau khi lưu. Lượt thi đã tạo giữ nguyên quy
        định. Công cụ nhà phát triển cập nhật khi mở lại app; trong lượt thi
        dùng quy định đã chốt.
      </p>
      {saved && (
        <p role="status" className="notice">
          Đã lưu quy định desktop.
        </p>
      )}
      <Form
        label="Lưu quy định desktop"
        onSubmit={async () => {
          const data = await send<{ rules: DesktopPolicy }>(
            "/admin/settings/desktop",
            rules,
            "PUT",
          );
          setRules(data.rules);
          setSaved(true);
        }}
      >
        {entries.map(([key, [label, description]]) => (
          <div key={key}>
            <label className="check">
              <input
                type="checkbox"
                checked={rules[key]}
                onChange={(event) => {
                  setRules({ ...rules, [key]: event.target.checked });
                  setSaved(false);
                }}
              />
              {label}
            </label>
            <p className="muted">{description}</p>
          </div>
        ))}
        <p>
          Sandbox, kiểm tra nguồn server, đăng nhập/phân quyền, kiểm tra minh
          chứng và cảnh báo dữ liệu chưa nộp luôn được giữ. Các công tắc này
          điều khiển ứng dụng; không khóa toàn bộ hệ điều hành.
        </p>
      </Form>
    </section>
  );
}
