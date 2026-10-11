import { test, expect } from "@playwright/test";

test("desktop disables selected extra outputs before starting and can restore", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const original = [
      { id: "HDMI-3", name: "Primary", primary: true },
      { id: "HDMI-2", name: "Secondary", primary: false },
    ];
    let monitors = original;
    let saved = false;
    const state = () => ({
      supported: true,
      monitors,
      canRestore: saved,
      message: "",
    });
    window.oralDesktop = {
      transcribe: async () => ({ transcript: "", stt_confidence: 0 }),
      displayStatus: async () => state(),
      useSingleDisplay: async (keep) => {
        await new Promise((resolve) => setTimeout(resolve, 400));
        monitors = original.filter((m) => m.id === keep);
        saved = true;
        return state();
      },
      restoreDisplays: async () => {
        monitors = original;
        saved = false;
        return state();
      },
      beginExam: async () => {
        if (monitors.length !== 1) throw new Error("Chỉ dùng một màn hình");
      },
      endExam: async () => {},
      sttModels: async () => [
        { id: "whisper-small", label: "Whisper-small", available: true },
      ],
    };
  });
  let started = false;
  await page.route("**/api/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/auth/me"))
      return route.fulfill({
        json: { id: "s", name: "Student", role: "STUDENT" },
      });
    if (path.endsWith("/exams/available"))
      return route.fulfill({
        json: [
          {
            id: "e",
            name: "Monitor test",
            status: "ASSIGNED",
            time_limit: 600,
            question_count: 1,
          },
        ],
      });
    if (path.endsWith("/stt/config"))
      return route.fulfill({
        json: { provider: "google", language: "vi", preprocessing: "raw" },
      });
    if (path.endsWith("/s/start")) started = true;
    return route.fulfill({
      json: {
        id: "s",
        exam_name: "Monitor test",
        status: started ? "IN_PROGRESS" : "DEVICE_CHECK",
        time_limit: 600,
        question_count: 1,
        server_time: Date.now() / 1000,
        started_at: started ? Date.now() / 1000 : null,
        current_attempt: started
          ? {
              id: "a",
              sequence: 1,
              text: "Explain monitor setup.",
              status: "READY",
            }
          : null,
      },
    });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Mở bài thi" }).click();
  await page.getByRole("button", { name: "Cho phép camera & mic" }).click();
  const start = page.getByRole("button", { name: "Bắt đầu thi", exact: true });
  await expect(
    page.getByText("Hệ điều hành đang bật 2 màn hình."),
  ).toBeVisible();
  await page.getByLabel("Màn hình cần giữ").selectOption("HDMI-2");
  await page
    .getByRole("button", { name: "Tắt màn hình phụ", exact: true })
    .click();
  await expect(start).toBeDisabled();
  await expect(
    page.getByText("Hệ điều hành đang bật 1 màn hình."),
  ).toBeVisible();
  expect(started).toBe(false);
  await page
    .getByRole("button", { name: "Khôi phục các màn hình", exact: true })
    .click();
  await expect(
    page.getByText("Hệ điều hành đang bật 2 màn hình."),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Tắt màn hình phụ", exact: true })
    .click();
  await expect(
    page.getByText("Hệ điều hành đang bật 1 màn hình."),
  ).toBeVisible();
  await start.click();
  await expect(
    page.getByRole("heading", { name: "Explain monitor setup." }),
  ).toBeVisible();
  expect(started).toBe(true);
});
