"use client";
import { useEffect, useState } from "react";
import { api, send, errorText } from "./api";
import { Empty, Form } from "./shared";
import SpeechSettings from "./speech-settings";

type Config = {
  ai_provider: string;
  llm_model: string;
  embedding_model: string;
  stt_model: string;
  google_login_enabled: boolean;
  google_client_id: string;
  public_origin: string;
  gemini_key_configured: boolean;
  google_secret_configured: boolean;
  google_redirect_uri: string;
};
export default function PlatformSettings() {
  const [config, setConfig] = useState<Config | null>(null),
    [tab, setTab] = useState("ai"),
    [error, setError] = useState(""),
    [saved, setSaved] = useState(false);
  const [key, setKey] = useState(""),
    [secret, setSecret] = useState(""),
    [clearKey, setClearKey] = useState(false),
    [clearSecret, setClearSecret] = useState(false);
  useEffect(() => {
    api<Config>("/admin/settings/platform")
      .then(setConfig)
      .catch((e) => setError(errorText(e)));
  }, []);
  if (!config) return <Empty>{error || "Đang tải cấu hình…"}</Empty>;
  const update = (values: Partial<Config>) => {
    setConfig({ ...config, ...values });
    setSaved(false);
  };
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">QUẢN TRỊ HỆ THỐNG</span>
          <h1>Cấu hình hệ thống</h1>
          <p className="muted">
            Thiết lập AI, đăng nhập Google và nhận dạng giọng nói.
          </p>
        </div>
      </div>
      <div className="tabs">
        {[
          ["ai", "AI & mô hình"],
          ["google", "Đăng nhập Google"],
          ["stt", "STT & giọng nói"],
        ].map(([id, label]) => (
          <button
            key={id}
            className={tab === id ? "active" : ""}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === "stt" ? (
        <SpeechSettings />
      ) : (
        <section className="panel">
          {saved && (
            <p role="status" className="notice">
              Đã lưu cấu hình. Khóa bí mật được giữ tại backend.
            </p>
          )}
          <Form
            label="Lưu cấu hình hệ thống"
            onSubmit={async () => {
              const {
                gemini_key_configured: _a,
                google_secret_configured: _b,
                google_redirect_uri: _c,
                ...values
              } = config;
              void _a;
              void _b;
              void _c;
              setConfig(
                await send<Config>(
                  "/admin/settings/platform",
                  {
                    ...values,
                    gemini_api_key: key || null,
                    google_client_secret: secret || null,
                    clear_gemini_key: clearKey,
                    clear_google_secret: clearSecret,
                  },
                  "PUT",
                ),
              );
              setKey("");
              setSecret("");
              setClearKey(false);
              setClearSecret(false);
              setSaved(true);
            }}
          >
            {tab === "ai" ? (
              <>
                <h2>AI & mô hình</h2>
                <p>
                  Gemini sinh câu hỏi và chấm bài từ transcript, rubric và tài
                  liệu. Chọn Whisper hoặc Google STT riêng trong tab STT & giọng
                  nói. Gemini chỉ cần API key, không cần JSON Google STT.
                </p>
                <label>
                  Nhà cung cấp AI
                  <select
                    value={config.ai_provider}
                    onChange={(e) => update({ ai_provider: e.target.value })}
                  >
                    <option value="demo">Demo — không chấm điểm AI</option>
                    <option value="gemini">Google Gemini</option>
                  </select>
                </label>
                {config.ai_provider === "demo" && (
                  <p className="notice">
                    Demo không gọi AI chấm điểm, kể cả khi đã nhập API key. Để
                    chấm điểm, chọn Google Gemini và lưu cấu hình, sau đó xử lý
                    tài liệu và công bố đề mới với cấu hình này. Đề đã công bố ở
                    chế độ demo giữ nguyên chế độ cũ.
                  </p>
                )}
                <label>
                  Gemini API key
                  <input
                    type="password"
                    autoComplete="new-password"
                    value={key}
                    onChange={(e) => setKey(e.target.value)}
                    placeholder={
                      config.gemini_key_configured
                        ? "Đã cấu hình — bỏ trống để giữ nguyên"
                        : "Nhập API key"
                    }
                    maxLength={500}
                  />
                </label>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={clearKey}
                    onChange={(e) => setClearKey(e.target.checked)}
                  />
                  Xóa Gemini API key đã lưu
                </label>
                <div className="form-grid">
                  <label>
                    Model chấm điểm
                    <input
                      required
                      value={config.llm_model}
                      onChange={(e) => update({ llm_model: e.target.value })}
                    />
                  </label>
                  <label>
                    Model embedding
                    <input
                      required
                      value={config.embedding_model}
                      onChange={(e) =>
                        update({ embedding_model: e.target.value })
                      }
                    />
                  </label>
                </div>
                <label>
                  Model Whisper trên server
                  <select
                    value={config.stt_model}
                    onChange={(e) => update({ stt_model: e.target.value })}
                  >
                    {[
                      "tiny",
                      "base",
                      "small",
                      "medium",
                      "large-v3",
                      "turbo",
                    ].map((m) => (
                      <option key={m}>{m}</option>
                    ))}
                  </select>
                </label>
                <p className="muted">
                  Thay đổi provider/model ảnh hưởng đề mới. Đề đã công bố giữ
                  cấu hình cũ và cần xem lại nếu cấu hình chấm hiện tại không
                  còn khớp. Tài liệu cũ cần được xử lý lại khi đổi model
                  embedding.
                </p>
              </>
            ) : (
              <>
                <h2>Đăng nhập Google / Gmail</h2>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={config.google_login_enabled}
                    onChange={(e) =>
                      update({ google_login_enabled: e.target.checked })
                    }
                  />
                  Cho phép đăng nhập bằng Google
                </label>
                <label>
                  Domain gốc của ứng dụng
                  <input
                    type="url"
                    required
                    value={config.public_origin}
                    onChange={(e) => update({ public_origin: e.target.value })}
                    placeholder="https://oral.example.edu"
                  />
                </label>
                <label>
                  Google OAuth Client ID
                  <input
                    value={config.google_client_id}
                    onChange={(e) =>
                      update({ google_client_id: e.target.value })
                    }
                    autoComplete="off"
                  />
                </label>
                <label>
                  Google OAuth Client Secret
                  <input
                    type="password"
                    autoComplete="new-password"
                    value={secret}
                    onChange={(e) => setSecret(e.target.value)}
                    placeholder={
                      config.google_secret_configured
                        ? "Đã cấu hình — bỏ trống để giữ nguyên"
                        : "Nhập Client Secret"
                    }
                    maxLength={500}
                  />
                </label>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={clearSecret}
                    onChange={(e) => setClearSecret(e.target.checked)}
                  />
                  Xóa Google Client Secret đã lưu
                </label>
                <p>
                  Trong Google Cloud Console, tạo OAuth Client loại{" "}
                  <strong>Web application</strong>, cấu hình màn hình đồng ý và
                  thêm Redirect URI:
                </p>
                <code className="wrap-code">
                  {config.public_origin.replace(/\/$/, "")}
                  /api/auth/google/callback
                </code>
                <p className="muted">
                  Chỉ xin thông tin đăng nhập cơ bản; không đọc hoặc gửi email.
                  Client Secret khác với JSON service account dùng cho Google
                  STT. Để sử dụng với domain thật, DNS và HTTPS phải trỏ về ứng
                  dụng.
                </p>
              </>
            )}
          </Form>
        </section>
      )}
    </>
  );
}
