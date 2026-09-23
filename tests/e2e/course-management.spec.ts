import { test, expect } from "@playwright/test";

test("admin sees generated terms and confirms full course deletion with retry", async ({
  page,
}) => {
  const course = {
    id: "course",
    code: "SE101",
    name: "Software Testing",
    status: "ACTIVE",
    description: "",
  };
  const exam = {
    id: "exam",
    name: "Oral exam",
    status: "DRAFT",
    rubric_id: "rubric",
    time_limit: 600,
    max_attempts: 1,
    blueprint: [{ topic_id: "topic", difficulty: "EASY", count: 1 }],
    questions: [] as {
      text: string;
      english_terms: { term: string; meaning: string }[];
    }[],
  };
  let deleted = false;
  let deleteCalls = 0;
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    let json: unknown = {};
    if (path === "/api/auth/me")
      json = { id: "admin", name: "Admin", role: "ADMIN" };
    else if (path === "/api/admin/courses") json = deleted ? [] : [course];
    else if (path === "/api/admin/users" || path === "/api/admin/results")
      json = [];
    else if (path === "/api/admin/dashboard")
      json = { courses: deleted ? 0 : 1, exams: 1, documents: 1, sessions: 1 };
    else if (path.endsWith("/workspace"))
      json = {
        outcomes: [],
        chapters: [],
        documents: [],
        topics: [{ id: "topic", name: "Testing" }],
        rubrics: [{ id: "rubric", name: "Rubric" }],
        exams: [exam],
      };
    else if (path.endsWith("/publish")) {
      exam.status = "PUBLISHED";
      exam.questions = [
        {
          text: "Giải thích unit test.",
          english_terms: [{ term: "unit test", meaning: "kiểm thử đơn vị" }],
        },
      ];
      json = { status: "PUBLISHED", question_count: 1 };
    } else if (
      path === "/api/admin/courses/course" &&
      route.request().method() === "DELETE"
    ) {
      expect(route.request().postDataJSON()).toEqual({ confirm_code: "SE101" });
      deleteCalls++;
      if (deleteCalls === 1)
        return route.fulfill({
          status: 409,
          json: {
            error: {
              message: "Môn học đang được xử lý. Đợi hoàn tất rồi xóa lại.",
            },
          },
        });
      deleted = true;
      json = { ok: true };
    }
    await route.fulfill({ json });
  });
  await page.goto("/");
  await page
    .getByRole("button", { name: "Môn học & đề thi", exact: true })
    .click();
  await page.getByRole("button", { name: /Software Testing/ }).click();
  await page.getByRole("button", { name: "03 · Bài thi & giao bài" }).click();
  await page.getByRole("button", { name: "Sinh câu hỏi & công bố" }).click();
  await expect(
    page.getByRole("heading", { name: "Câu hỏi & thuật ngữ tiếng Anh gợi ý" }),
  ).toBeVisible();
  await expect(page.locator(".generated-question")).toContainText(
    "Giải thích unit test.",
  );
  await expect(page.locator(".generated-question li")).toHaveText(
    "unit test: kiểm thử đơn vị",
  );
  await page.getByRole("button", { name: "Cài đặt", exact: true }).click();
  await page.getByRole("button", { name: "Xóa môn học", exact: true }).click();
  await expect(
    page.getByText(/kể cả bài đang làm và lịch sử thi/),
  ).toBeVisible();
  const input = page.getByRole("textbox", {
    name: "Nhập mã môn học SE101 để xác nhận",
  });
  const submit = page.getByRole("button", {
    name: "Xóa vĩnh viễn môn học và dữ liệu",
    exact: true,
  });
  await input.fill("WRONG");
  await submit.click();
  await expect(page.locator("form [role=alert]")).toHaveText(
    "Mã môn học không khớp.",
  );
  expect(deleteCalls).toBe(0);
  await input.fill("SE101");
  await submit.click();
  await expect(page.locator("form [role=alert]")).toContainText(
    "Môn học đang được xử lý",
  );
  await submit.click();
  await expect(
    page.getByRole("button", { name: /Software Testing/ }),
  ).toHaveCount(0);
  await expect(page.getByText("0 môn học", { exact: true })).toBeVisible();
  expect(deleteCalls).toBe(2);
});
