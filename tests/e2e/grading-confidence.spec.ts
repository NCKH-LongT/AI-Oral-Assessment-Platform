import { test, expect } from "@playwright/test";

for (const kind of ["legacy-error", "error", "demo", "valid-zero"]) {
  test(`grading confidence distinguishes ${kind}`, async ({ page }) => {
    const writes: unknown[] = [];
    const review = {
      id: "result",
      exam_name: "Grading recovery",
      student_name: "Student",
      status: "REVIEW_REQUIRED",
      final_score: null,
      snapshot: {
        rubric_version: 1,
        knowledge_version: "test",
        ai_provider: "gemini",
        llm_model: "gemini-2.5-flash",
      },
      attempts: [
        {
          id: "attempt",
          sequence: 1,
          status: "GRADED",
          question: { text: "Original question" },
          transcript: "Original answer",
          stt_confidence: 0.96,
          assessment: {
            score: kind === "valid-zero" ? 0 : null,
            confidence:
              kind === "legacy-error" || kind === "valid-zero" ? 0 : null,
            error: kind.includes("error") ? "ValueError" : undefined,
            error_code: kind === "error" ? "AI_CONFIG_MISMATCH" : undefined,
            reasoning_summary: "Assessment state",
            criteria: [],
          },
          grading_targets: [
            {
              id: "target",
              name: "Compatible version",
              model: "gemini-2.5-flash",
            },
          ],
          evidence: [],
          reviews: [],
        },
      ],
    };
    await page.route("**/api/**", async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path === "/api/auth/me")
        return route.fulfill({
          json: { id: "admin", role: "ADMIN", name: "Admin" },
        });
      if (path === "/api/admin/results")
        return route.fulfill({ json: [review] });
      if (path === "/api/admin/results/result")
        return route.fulfill({ json: review });
      if (route.request().method() === "POST") {
        expect(path).toBe("/api/admin/attempts/attempt/grade-review");
        writes.push(route.request().postDataJSON());
        return route.fulfill({
          status: 202,
          json: { id: "job", status: "PENDING" },
        });
      }
      return route.fulfill({
        json: path.endsWith("dashboard")
          ? { courses: 0, documents: 0, exams: 0, sessions: 1 }
          : [],
      });
    });
    await page.goto("/");
    await page
      .getByRole("button", { name: "Kết quả & xem lại", exact: true })
      .click();
    await page.getByRole("button", { name: "Xem bài →" }).click();
    if (kind === "valid-zero") {
      await expect(page.getByText(/Độ tin cậy do AI tự báo: 0%/)).toBeVisible();
    } else {
      await expect(page.getByText(/Chưa có độ tin cậy AI/)).toBeVisible();
      await expect(page.getByText(/Độ tin cậy do AI tự báo:/)).toHaveCount(0);
    }
    if (kind === "error") {
      await expect(page.getByText("Mã lỗi: AI_CONFIG_MISMATCH")).toBeVisible();
      await page
        .getByText("Chấm lại transcript đã nộp", { exact: true })
        .click();
      await page.getByLabel("Phiên bản dùng để chấm").selectOption("target");
      await page
        .getByLabel("Lý do chấm lại", { exact: true })
        .fill("Use compatible grading version");
      await page
        .getByRole("button", { name: "Chấm lại transcript", exact: true })
        .click();
      await expect
        .poll(() => writes)
        .toEqual([
          {
            target_exam_id: "target",
            reason: "Use compatible grading version",
          },
        ]);
      await expect(
        page.getByText("Original answer", { exact: true }),
      ).toBeVisible();
    }
  });
}
