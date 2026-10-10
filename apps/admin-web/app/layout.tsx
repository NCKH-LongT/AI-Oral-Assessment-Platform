import type { Metadata } from "next";
import "./globals.css";
import { cookies } from "next/headers";
import BackendPicker from "../components/backend-picker";
import { backendConfig, MODE_COOKIE } from "../lib/client-backend.mjs";
export const metadata: Metadata = {
  title: "OralAI · Nền tảng thi vấn đáp",
  description:
    "Quản lý và đánh giá thi vấn đáp dựa trên rubric và tài liệu môn học",
};
export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const backend = backendConfig();
  const saved = backend ? (await cookies()).get(MODE_COOKIE)?.value : undefined;
  const mode =
    saved === "local" || saved === "online" ? saved : backend?.defaultMode;
  return (
    <html lang="vi">
      <body>
        {backend ? (
          <BackendPicker
            config={{ mode: mode as "local" | "online", urls: backend.urls }}
          >
            {children}
          </BackendPicker>
        ) : (
          children
        )}
      </body>
    </html>
  );
}
