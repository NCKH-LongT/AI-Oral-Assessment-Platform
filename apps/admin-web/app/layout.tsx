import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "OralAI · Nền tảng thi vấn đáp",
  description:
    "Quản lý và đánh giá thi vấn đáp dựa trên rubric và tài liệu môn học",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="vi">
      <body>{children}</body>
    </html>
  );
}
