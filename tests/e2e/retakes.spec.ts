import { test, expect } from "@playwright/test";

const now = Date.now() / 1000;
const course = {
  id: "course",
  name: "Retake course",
  code: "RT",
  owner_id: "admin",
  status: "ACTIVE",
  description: "Test",
};
const exam = {
  id: "exam",
  name: "Retake exam",
  status: "PUBLISHED",
  course_id: "course",
  rubric_id: "rubric",
  time_limit: 600,
  blueprint: [{ topic_id: "topic", count: 1, difficulty: "MEDIUM" }],
  max_attempts: 1 as number | null,
};
const rows = () =>
  [2, 1].map((n) => ({
    id: `session-${n}`,
    exam_id: "exam",
    student_id: "student",
    exam_name: "Retake exam",
    student_name: "Học viên A",
    attempt_number: n,
    created_at: now - 100 * (3 - n),
    started_at: now - 100,
    completed_at: now,
    status: "COMPLETED",
    final_score: n === 1 ? 6 : 8,
    max_attempts: 2,
    remaining_attempts: 0,
  }));

test("admin sets limits, reviews sittings, grants extra attempts and deletes only the chosen sitting", async ({
  page,
}) => {
  const currentExam = { ...exam };
  let results = rows();
  const limits: (number | null)[] = [];
  const grants: unknown[] = [];
  const deleted: string[] = [];
  await page.route("**/api/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    let json: unknown = {};
    if (path === "/api/auth/me")
      json = { id: "admin", name: "Admin", role: "ADMIN" };
    else if (path === "/api/admin/courses") json = [course];
    else if (path === "/api/admin/users") json = [];
    else if (path === "/api/admin/dashboard")
      json = {
        courses: 1,
        exams: 1,
        documents: 0,
        sessions: results.length,
        ai_provider: "demo",
      };
    else if (path.endsWith("/workspace"))
      json = {
        outcomes: [],
        topics: [],
        documents: [],
        rubrics: [],
        chapters: [],
        exams: [currentExam],
      };
    else if (path.endsWith("/attempt-policy")) {
      currentExam.max_attempts = route.request().postDataJSON().max_attempts;
      limits.push(currentExam.max_attempts);
      json = currentExam;
    } else if (path === "/api/admin/results") json = results;
    else if (path.endsWith("/retake")) {
      grants.push(route.request().postDataJSON());
      results = results.map((r) => ({ ...r, remaining_attempts: 2 }));
    } else if (path.startsWith("/api/admin/results/")) {
      const id = path.split("/").at(-1)!;
      if (route.request().method() === "DELETE") {
        deleted.push(id);
        results = results.filter((r) => r.id !== id);
      } else
        json = {
          ...results.find((r) => r.id === id),
          history: results,
          snapshot: {
            rubric_version: 1,
            ai_provider: "demo",
            knowledge_version: "test",
          },
          attempts: [],
        };
    }
    return route.fulfill({ json });
  });
  await page.goto("/");
  await page
    .getByRole("button", { name: "Môn học & đề thi", exact: true })
    .click();
  await page.getByRole("button", { name: /Retake course/ }).click();
  await page.getByRole("button", { name: "03 · Bài thi & giao bài" }).click();
  for (const [mode, expected] of [
    ["limited", 3],
    ["unlimited", null],
    ["none", 1],
  ] as const) {
    await page.getByText("Cấu hình số lần làm lại", { exact: true }).click();
    await page
      .getByRole("combobox", { name: "Cho phép làm lại" })
      .selectOption(mode);
    if (mode === "limited")
      await page
        .getByRole("spinbutton", { name: "Số lần làm lại", exact: true })
        .fill("2");
    await page
      .getByRole("button", { name: "Lưu số lần làm lại", exact: true })
      .click();
    await expect.poll(() => limits.at(-1)).toBe(expected);
  }
  await page
    .getByRole("button", { name: "Kết quả & xem lại", exact: true })
    .click();
  await expect(
    page.getByRole("cell", { name: "Lần 1", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("cell", { name: "Lần 2", exact: true }),
  ).toBeVisible();
  const first = page
    .getByRole("row")
    .filter({ has: page.getByRole("cell", { name: "Lần 1", exact: true }) });
  await first.getByRole("button", { name: "Xem bài →" }).click();
  await expect(
    page.getByRole("heading", { name: "Retake exam · Lần 1" }),
  ).toBeVisible();
  await page
    .getByRole("combobox", { name: "Lịch sử làm bài" })
    .selectOption("session-2");
  await expect(
    page.getByRole("heading", { name: "Retake exam · Lần 2" }),
  ).toBeVisible();
  await page.getByText("Quản lý lượt thi", { exact: true }).click();
  await page.getByRole("spinbutton", { name: "Số lượt cấp thêm" }).fill("2");
  await page
    .getByRole("button", { name: "Cấp thêm lượt", exact: true })
    .click();
  await expect.poll(() => grants).toEqual([{ additional_attempts: 2 }]);
  page.once("dialog", (dialog) => dialog.dismiss());
  await page
    .getByRole("button", { name: "Xóa lần thi này", exact: true })
    .click();
  expect(deleted).toEqual([]);
  page.once("dialog", (dialog) => dialog.accept());
  await page
    .getByRole("button", { name: "Xóa lần thi này", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Kết quả & xem lại", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("cell", { name: "Lần 1", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("cell", { name: "Lần 2", exact: true }),
  ).toHaveCount(0);
  expect(deleted).toEqual(["session-2"]);
});

test("student sees history and only requests a new sitting when allowed", async ({
  page,
}) => {
  const history = rows();
  const requests: unknown[] = [];
  let allowed = false;
  await page.route("**/api/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    let json: unknown = {};
    if (path === "/api/auth/me")
      json = { id: "student", name: "Học viên A", role: "STUDENT" };
    else if (path === "/api/exams/available")
      json = [
        {
          ...exam,
          question_count: 1,
          status: "COMPLETED",
          session_id: "session-2",
          attempt_count: 2,
          remaining_attempts: allowed ? 1 : 0,
          can_start_new: allowed,
          history,
        },
      ];
    else if (path === "/api/exam-sessions") {
      requests.push(route.request().postDataJSON());
      json = {
        ...history[0],
        id: "session-3",
        attempt_number: 3,
        status: "DEVICE_CHECK",
        time_limit: 600,
        question_count: 1,
        server_time: now,
        current_attempt: null,
        started_at: null,
      };
    } else if (path.startsWith("/api/exam-sessions/"))
      json = {
        ...history.find((s) => s.id === path.split("/").at(-1)),
        time_limit: 600,
        question_count: 1,
        answered_count: 1,
        current_attempt: null,
        server_time: now,
      };
    return route.fulfill({ json });
  });
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Làm lại bài thi", exact: true }),
  ).toHaveCount(0);
  await page.getByText("Lịch sử làm bài (2)", { exact: true }).click();
  await page.getByRole("button", { name: "Xem lần 1", exact: true }).click();
  await expect(page.locator(".finished")).toContainText("6/10");
  await page.getByRole("button", { name: "Về danh sách bài thi" }).click();
  allowed = true;
  await page.getByRole("button", { name: "Làm mới bài thi" }).click();
  await page
    .getByRole("button", { name: "Làm lại bài thi", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Retake exam · Lần 3" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Kiểm tra thiết bị", exact: true }),
  ).toBeVisible();
  expect(requests).toEqual([{ exam_id: "exam", new_attempt: true }]);
});
