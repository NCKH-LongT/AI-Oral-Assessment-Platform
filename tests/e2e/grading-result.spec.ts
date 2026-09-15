import { test, expect } from "@playwright/test";

for (const scenario of [
  {
    name: "queued",
    status: "SUBMITTED",
    score: null,
    expected: "đang chờ máy chủ chấm điểm",
  },
  {
    name: "pending zero",
    status: "SUBMITTED",
    score: 0,
    expected: "đang chờ máy chủ chấm điểm",
  },
  {
    name: "review zero",
    status: "REVIEW_REQUIRED",
    score: 0,
    expected: "cần giảng viên xem lại",
  },
  {
    name: "missing score",
    status: "COMPLETED",
    score: null,
    expected: "Chưa có điểm chính thức",
  },
  {
    name: "demo",
    status: "REVIEW_REQUIRED",
    score: null,
    message: "Đề thi ở chế độ demo: AI không chấm điểm.",
    expected: "AI không chấm điểm",
  },
  {
    name: "failed",
    status: "REVIEW_REQUIRED",
    score: null,
    message: "Chấm tự động thất bại; cần giảng viên kiểm tra và chấm lại.",
    expected: "Chấm tự động thất bại",
  },
  { name: "real zero", status: "COMPLETED", score: 0, expected: "0/10" },
  { name: "graded", status: "COMPLETED", score: 7.2, expected: "7.2/10" },
]) {
  test(`result: ${scenario.name}`, async ({ page }) => {
    await page.route("**/api/auth/me", (r) =>
      r.fulfill({
        json: {
          id: "student",
          name: "Grading test",
          username: "grading",
          role: "STUDENT",
        },
      }),
    );
    await page.route("**/api/exams/available", (r) =>
      r.fulfill({
        json: [
          {
            id: "exam",
            name: "Grading exam",
            status: scenario.status,
            time_limit: 600,
            question_count: 1,
          },
        ],
      }),
    );
    const session = {
      id: "grading-session",
      exam_name: "Grading exam",
      status: scenario.status,
      started_at: null,
      time_limit: 600,
      server_time: Date.now() / 1000,
      final_score: scenario.score,
      grading_message: scenario.message,
      question_count: 1,
      answered_count: 1,
      current_attempt: null,
    };
    await page.route("**/api/exam-sessions", (r) =>
      r.fulfill({ json: session }),
    );
    await page.route("**/api/exam-sessions/grading-session", (r) =>
      r.fulfill({ json: session }),
    );
    await page.goto("/");
    await page.getByRole("button", { name: "Mở bài thi" }).click();
    const result = page.locator(".finished");
    await expect(result).toContainText(scenario.expected);
    if (scenario.status !== "COMPLETED" || scenario.score === null)
      await expect(result).not.toContainText("/10");
  });
}
