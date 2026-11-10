import { test, expect, type Page } from "@playwright/test";

const criterion = (name: string) => ({
  name,
  description:
    "Full credit: clear answer; partial: incomplete; zero: no answer",
  max_score: 3,
  weight: 1,
});
function snapshot() {
  return {
    criteria: [criterion("Legacy template")],
    questions: [1, 2].map((i) => ({
      text: `Describe your daily routine and explain improvement number ${i}.`,
      difficulty: "EASY",
      expected_concepts: ["Personal example"],
      reference_chunk_ids: ["chunk"],
      english_terms: [],
      criteria: [criterion(`Question ${i} content`)],
      preparation_seconds: 10,
      recording_seconds: 60,
    })),
  };
}

async function openExam(page: Page) {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Điều phối kỳ thi", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Mở kỳ thi Controlled exam", exact: true })
    .click();
}

test("office closes and reopens the same frozen exam while keeping rubric review accessible", async ({
  page,
}) => {
  const exam = {
    id: "exam",
    name: "Controlled exam",
    status: "PUBLISHED",
    course_id: "course",
    course_name: "English",
    teacher_id: "teacher",
    time_limit: 900,
  };
  const frozen = snapshot();
  const actions: string[] = [];
  await page.route("**/api/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    let json: unknown = [];
    if (path === "/api/auth/me")
      json = { id: "office", name: "Office", role: "EXAM_OFFICER" };
    else if (path.endsWith("/examination/exams")) json = [exam];
    else if (path.endsWith("/dashboard"))
      json = { courses: 1, documents: 1, exams: 1, sessions: 0 };
    else if (path.endsWith("/draft"))
      json = { status: exam.status, snapshot: frozen };
    else if (path.endsWith("/close")) {
      actions.push("close");
      exam.status = "CLOSED";
      json = { status: exam.status };
    } else if (path.endsWith("/reopen")) {
      actions.push("reopen");
      exam.status = "PUBLISHED";
      json = { status: exam.status };
    }
    return route.fulfill({ json });
  });
  await openExam(page);
  await page.getByRole("button", { name: "Đóng kỳ thi", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Mở lại kỳ thi", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Rubric của câu 1", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Tên", { exact: true }).first()).toBeDisabled();
  await page
    .getByRole("button", { name: "Mở lại kỳ thi", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Đóng kỳ thi", exact: true }),
  ).toBeVisible();
  expect(actions).toEqual(["close", "reopen"]);
});

test("teacher edits criteria independently and must save before approval", async ({
  page,
}) => {
  const exam = {
    id: "exam",
    name: "Controlled exam",
    status: "GENERATED",
    course_id: "course",
    course_name: "English",
    teacher_id: "teacher",
    time_limit: 900,
  };
  let content = snapshot();
  let saved = false;
  await page.route("**/api/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    let json: unknown = [];
    if (path === "/api/auth/me")
      json = { id: "teacher", name: "Teacher", role: "TEACHER" };
    else if (path.endsWith("/examination/exams")) json = [exam];
    else if (path.endsWith("/dashboard"))
      json = { courses: 1, documents: 1, exams: 1, sessions: 0 };
    else if (path.endsWith("/rubric-preview"))
      json = { criteria: [criterion("Question 1 content")], demo: false };
    else if (path.endsWith("/draft")) {
      if (route.request().method() === "PUT") {
        const body = route.request().postDataJSON();
        expect(body.questions[0].criteria).toHaveLength(2);
        expect(body.questions[0].criteria[0].name).toBe(
          "Daily routine evidence",
        );
        expect(body.questions[1].criteria).toEqual([
          criterion("Question 2 content"),
        ]);
        content = {
          ...body,
          questions: body.questions.map((q: object) => ({
            ...q,
            difficulty: "EASY",
          })),
        };
        saved = true;
      }
      json = { status: exam.status, snapshot: content };
    } else if (path.endsWith("/teacher-approve")) {
      expect(saved).toBe(true);
      exam.status = "TEACHER_APPROVED";
      json = { status: exam.status };
    }
    return route.fulfill({ json });
  });
  await openExam(page);
  await page
    .getByRole("button", { name: "Gợi ý rubric AI cho câu 1", exact: true })
    .click();
  await expect(
    page.getByText("Đã gợi ý rubric câu 1. Kiểm tra và lưu trước khi duyệt."),
  ).toBeVisible();
  const first = page.locator("fieldset").filter({
    has: page.getByRole("heading", { name: "Rubric của câu 1", exact: true }),
  });
  await first.getByLabel("Tên", { exact: true }).fill("Daily routine evidence");
  const approve = page.getByRole("button", {
    name: "Duyệt đề & gửi khảo thí",
    exact: true,
  });
  await expect(approve).toBeDisabled();
  await first
    .getByRole("button", { name: "Thêm tiêu chí", exact: true })
    .click();
  await first.getByLabel("Tên", { exact: true }).nth(1).fill("Future plans");
  await first
    .getByRole("textbox", { name: "Mô tả mức điểm", exact: true })
    .nth(1)
    .fill("Full: reasoned plan; partial: plan only; zero: no plan.");
  await page
    .getByRole("button", { name: "Lưu nội dung đã review", exact: true })
    .click();
  await expect(approve).toBeEnabled();
  await approve.click();
  await expect(page.getByText("Chờ khảo thí kiểm tra").first()).toBeVisible();
  await expect(first.getByLabel("Tên", { exact: true }).first()).toBeDisabled();
});
