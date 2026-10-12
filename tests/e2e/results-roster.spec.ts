import { test, expect } from "@playwright/test";

test("results select course/exam/date/attempt, include absent students and retain filters", async ({
  page,
}) => {
  const queries: URLSearchParams[] = [];
  const review = {
    id: "s",
    exam_name: "English speaking",
    student_name: "An",
    attempt_number: 2,
    status: "COMPLETED",
    final_score: 0,
    history: [],
    attempts: [],
    snapshot: {
      rubric_version: 1,
      knowledge_version: "test",
      ai_provider: "demo",
    },
  };
  await page.route("**/api/**", (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    if (path === "/api/auth/me")
      return route.fulfill({
        json: { id: "admin", role: "ADMIN", name: "Admin" },
      });
    if (path === "/api/admin/courses")
      return route.fulfill({
        json: [{ id: "c", code: "EN", name: "English", status: "ACTIVE" }],
      });
    if (path === "/api/admin/courses/c/results") {
      queries.push(url.searchParams);
      return route.fulfill({
        json: {
          exams: [{ id: "e", name: "English speaking", status: "PUBLISHED" }],
          dates: ["2026-10-12"],
          attempt_numbers: [1, 2],
          rows: [
            {
              student_id: "an",
              student_name: "An",
              status: "COMPLETED",
              final_score: 0,
              session: { id: "s", attempt_number: 2, created_at: 1791800100 },
              processing: null,
            },
            {
              student_id: "binh",
              student_name: "Bình",
              status: "NOT_TAKEN",
              final_score: null,
              session: null,
              processing: null,
            },
            {
              student_id: "chi",
              student_name: "Chi",
              status: "SUBMITTED",
              final_score: null,
              session: {
                id: "pending",
                attempt_number: 2,
                created_at: 1791800100,
              },
              processing: {
                status: "STT_RUNNING",
                total: 3,
                transcribed: 1,
                completed: 0,
                failed: 0,
              },
            },
          ],
        },
      });
    }
    if (path === "/api/admin/results/s") return route.fulfill({ json: review });
    return route.fulfill({
      json: path.endsWith("dashboard")
        ? { courses: 1, exams: 1, documents: 0, sessions: 2 }
        : [],
    });
  });
  await page.goto("/");
  await page
    .getByRole("button", { name: "Kết quả & xem lại", exact: true })
    .click();
  await expect(page.getByText("Chọn môn học để bắt đầu.")).toBeVisible();
  await page
    .getByRole("combobox", { name: "Môn học", exact: true })
    .selectOption("c");
  await page
    .getByRole("combobox", { name: "Đề / kỳ thi", exact: true })
    .selectOption("e");
  await page.getByLabel("Ngày thi (giờ Việt Nam)").fill("2026-10-12");
  await page
    .getByRole("combobox", { name: "Lần làm bài", exact: true })
    .selectOption("2");
  await expect.poll(() => queries.at(-1)?.get("attempt_number")).toBe("2");
  expect(queries.at(-1)?.get("exam_date")).toBe("2026-10-12");
  await expect(page.getByRole("row").filter({ hasText: "Bình" })).toContainText(
    "Chưa thi",
  );
  await expect(page.getByRole("row").filter({ hasText: "Chi" })).toContainText(
    "Đang nhận dạng",
  );
  const an = page
    .getByRole("row")
    .filter({ has: page.getByText("An", { exact: true }) });
  await expect(an).toContainText("0/10");
  await an.getByRole("button", { name: "Xem bài →" }).click();
  await expect(
    page.getByRole("heading", { name: "English speaking · Lần 2" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Tất cả kết quả" }).click();
  await expect(
    page.getByRole("combobox", { name: "Môn học", exact: true }),
  ).toHaveValue("c");
  await expect(page.getByLabel("Ngày thi (giờ Việt Nam)")).toHaveValue(
    "2026-10-12",
  );
  await expect(
    page.getByRole("combobox", { name: "Lần làm bài", exact: true }),
  ).toHaveValue("2");
  await page.getByLabel("Trạng thái bài thi").selectOption("not_submitted");
  await expect(page.getByRole("row")).toHaveCount(2);
  await expect(page.getByRole("row").last()).toContainText("Bình");
});
