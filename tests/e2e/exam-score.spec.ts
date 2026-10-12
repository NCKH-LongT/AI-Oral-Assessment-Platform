import {
  installResultRoster,
  selectResultExam,
} from "./helpers/results-roster";
import { test, expect } from "@playwright/test";

test("admin sees the question mean alongside a separately reviewed final grade", async ({
  page,
}) => {
  const result = {
    id: "session",
    exam_id: "exam",
    student_id: "student",
    exam_name: "English oral",
    student_name: "Student",
    status: "COMPLETED",
    final_score: 7,
    ai_score: 8,
    attempt_number: 1,
    created_at: 1800000000,
    remaining_attempts: 0,
    max_attempts: 1,
  };
  await page.route("**/api/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    let json: unknown = {};
    if (path === "/api/auth/me")
      json = { id: "admin", name: "Admin", role: "ADMIN" };
    else if (path === "/api/admin/courses" || path === "/api/admin/users")
      json = [];
    else if (path === "/api/admin/dashboard")
      json = { courses: 1, documents: 3, exams: 1, sessions: 1 };
    else if (path === "/api/admin/results") json = [result];
    else if (path === "/api/admin/results/session")
      json = {
        ...result,
        history: [result],
        attempts: [],
        snapshot: {
          rubric_version: 1,
          knowledge_version: "test",
          ai_provider: "gemini",
          llm_model: "test",
        },
        manual_review: { score: 7, reason: "Đã đối chiếu bản ghi." },
        score_summary: {
          total_score: 8,
          question_count: 3,
          graded_question_count: 3,
          question_scores: [6, 8, 10].map((score, i) => ({
            sequence: i + 1,
            score,
          })),
        },
      };
    return route.fulfill({ json });
  });
  await installResultRoster(page, result);
  await page.goto("/");
  await page
    .getByRole("button", { name: "Kết quả & xem lại", exact: true })
    .click();
  await selectResultExam(page);
  await page.getByRole("button", { name: "Xem bài →", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "Điểm tổng bài thi" }),
  ).toContainText("(6 + 8 + 10) ÷ 3 = 8/10");
  await expect(
    page.getByText("Điểm chính thức: 7/10", { exact: true }),
  ).toBeVisible();
});

for (const complete of [true, false]) {
  test(`student never sees grades even in a legacy server response: ${complete}`, async ({
    page,
  }) => {
    await page.addInitScript(() => {
      window.oralDesktop = {
        transcribe: async () => ({ transcript: "", stt_confidence: 1 }),
      };
    });
    const scores = [0, complete ? 6 : null, 9];
    await page.route("**/api/**", (route) => {
      const path = new URL(route.request().url()).pathname;
      let json: unknown = {};
      if (path === "/api/auth/me")
        json = { id: "student", name: "Student", role: "STUDENT" };
      if (path === "/api/exams/available")
        json = [
          {
            id: "exam",
            name: "English oral",
            question_count: 3,
            time_limit: 600,
            session_id: "session",
            status: "REVIEW_REQUIRED",
            attempt_count: 1,
            remaining_attempts: 0,
            can_start_new: false,
            history: [
              {
                id: "session",
                attempt_number: 1,
                status: "COMPLETED",
                final_score: 5,
                created_at: 1800000000,
              },
            ],
          },
        ];
      if (path.startsWith("/api/exam-sessions"))
        json = {
          id: "session",
          exam_name: "English oral",
          attempt_number: 1,
          status: "REVIEW_REQUIRED",
          final_score: null,
          question_count: 3,
          answered_count: 3,
          time_limit: 600,
          current_attempt: null,
          server_time: Date.now() / 1000,
          started_at: null,
          score_summary: {
            total_score: complete ? 5 : null,
            question_count: 3,
            graded_question_count: complete ? 3 : 2,
            question_scores: scores.map((score, i) => ({
              sequence: i + 1,
              score,
            })),
          },
        };
      return route.fulfill({ json });
    });
    await page.goto("/");
    await page
      .getByRole("button", { name: "Xem xác nhận nộp bài →", exact: true })
      .click();
    await expect(
      page.getByRole("region", { name: "Điểm tổng bài thi" }),
    ).toHaveCount(0);
    await expect(page.locator(".finished")).toContainText("Đã nộp bài thi");
    await expect(page.locator("main")).not.toContainText("Điểm chính thức:");
    await expect(page.locator("main")).not.toContainText("Cần xem lại");
    await page.getByRole("button", { name: "Về danh sách bài thi" }).click();
    await page.getByText("Lịch sử làm bài (1)", { exact: true }).click();
    await expect(page.locator("main")).not.toContainText("5/10");
    await expect(page.locator("main")).not.toContainText("Chưa xác nhận điểm");
  });
}
