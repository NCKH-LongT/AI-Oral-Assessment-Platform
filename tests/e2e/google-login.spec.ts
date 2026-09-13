import { test, expect } from "@playwright/test";

test("desktop Google button opens system browser and finishes through polling", async ({
  page,
}) => {
  await page.addInitScript(() => {
    (window as unknown as { openedGoogle: string }).openedGoogle = "";
    window.oralDesktop = {
      transcribe: async () => ({ transcript: "", stt_confidence: 0 }),
      openGoogle: async (url) => {
        (window as unknown as { openedGoogle: string }).openedGoogle = url;
      },
    };
  });
  await page.route("**/api/auth/google/config", (r) =>
    r.fulfill({ json: { enabled: true } }),
  );
  await page.route("**/api/auth/google/desktop", (r) =>
    r.fulfill({
      json: {
        flow_id: "synthetic-flow",
        poll_token: "synthetic-poll-token",
        url: "http://localhost:3100/api/auth/google/start?flow_id=synthetic-flow",
      },
    }),
  );
  await page.route("**/api/auth/google/poll", (r) =>
    r.fulfill({
      json: {
        pending: false,
        user: {
          id: "google-user",
          username: "google",
          name: "Học viên Google",
          role: "STUDENT",
          email: "synthetic@gmail.com",
        },
      },
    }),
  );
  await page.route("**/api/exams/available", (r) => r.fulfill({ json: [] }));
  await page.goto("/");
  await page
    .getByRole("button", { name: "Đăng nhập bằng Google", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Bài thi của tôi", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => (window as unknown as { openedGoogle: string }).openedGoogle,
    ),
  ).toContain("/api/auth/google/start?flow_id=");
});
