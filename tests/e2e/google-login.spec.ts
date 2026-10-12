import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.route("**/api/auth/me", (r) =>
    r.fulfill({ status: 401, json: {} }),
  );
  await page.route("**/api/auth/refresh", (r) =>
    r.fulfill({ status: 401, json: {} }),
  );
});

for (const focusFails of [false, true]) {
  test(`desktop Google login returns to the app (focus rejected: ${focusFails})`, async ({
    page,
  }) => {
    await page.addInitScript((focusFails) => {
      (window as unknown as { openedGoogle: string }).openedGoogle = "";
      (window as unknown as { focusRequests: number }).focusRequests = 0;
      window.oralDesktop = {
        transcribe: async () => ({ transcript: "", stt_confidence: 0 }),
        openGoogle: async (url) => {
          (window as unknown as { openedGoogle: string }).openedGoogle = url;
        },
        focus: async () => {
          (window as unknown as { focusRequests: number }).focusRequests++;
          if (focusFails) throw new Error("Window manager denied focus");
        },
      };
    }, focusFails);
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
    expect(
      await page.evaluate(
        () => (window as unknown as { focusRequests: number }).focusRequests,
      ),
    ).toBe(1);
  });
}

test("local web closes the Google popup and returns to the main app", async ({
  page,
  context,
  request,
}) => {
  const config = await (await request.get("/client-backend")).json();
  test.skip(!config.enabled, "Requires the local client launcher");
  let completed = false;
  await page.addInitScript(() => {
    (window as unknown as { focusRequests: number }).focusRequests = 0;
    window.focus = () => {
      (window as unknown as { focusRequests: number }).focusRequests++;
    };
  });
  await page.route("**/api/auth/google/config", (r) =>
    r.fulfill({ json: { enabled: true } }),
  );
  await page.route("**/api/auth/google/desktop", (r) =>
    r.fulfill({
      json: {
        flow_id: "web-flow",
        poll_token: "synthetic-poll-token",
        url:
          config.urls[config.defaultMode] +
          "/api/auth/google/start?flow_id=web-flow",
      },
    }),
  );
  await context.route("**/api/auth/google/start?flow_id=web-flow", (r) =>
    r.fulfill({
      contentType: "text/html",
      body: "<h1>Google login fixture</h1>",
    }),
  );
  await page.route("**/api/auth/google/poll", (r) =>
    r.fulfill({
      json: completed
        ? {
            pending: false,
            user: {
              id: "web-user",
              username: "google",
              name: "Học viên Google",
              role: "ADMIN",
            },
          }
        : { pending: true },
    }),
  );
  await page.route("**/api/exams/available", (r) => r.fulfill({ json: [] }));
  await page.route("**/api/admin/courses", (r) => r.fulfill({ json: [] }));
  await page.route("**/api/admin/users", (r) => r.fulfill({ json: [] }));
  await page.route("**/api/admin/dashboard", (r) =>
    r.fulfill({ json: { courses: 0, documents: 0, exams: 0, sessions: 0 } }),
  );
  await page.goto("/");
  const popupPromise = page.waitForEvent("popup");
  await page
    .getByRole("button", { name: "Đăng nhập bằng Google", exact: true })
    .click();
  const popup = await popupPromise;
  await expect(
    popup.getByRole("heading", { name: "Google login fixture" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => (window as unknown as { focusRequests: number }).focusRequests,
    ),
  ).toBe(0);
  completed = true;
  await expect(
    page.getByRole("button", { name: "Tổng quan", exact: true }),
  ).toBeVisible();
  await expect.poll(() => popup.isClosed()).toBe(true);
  expect(
    await page.evaluate(
      () => (window as unknown as { focusRequests: number }).focusRequests,
    ),
  ).toBe(1);
});
