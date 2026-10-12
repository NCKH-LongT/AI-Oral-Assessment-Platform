import { test, expect } from "@playwright/test";

const exam = {
  id: "exam",
  name: "Thi cuối kỳ",
  status: "GENERATED",
  course_id: "course",
  course_name: "Kiểm thử phần mềm",
  teacher_id: "teacher",
  time_limit: 900,
};
const snapshot = {
  questions: [
    {
      text: "Giải thích kiểm thử đơn vị và cho ví dụ.",
      difficulty: "EASY",
      expected_concepts: ["Unit testing"],
      reference_chunk_ids: ["chunk"],
      english_terms: [],
    },
  ],
  criteria: [
    {
      name: "Kiến thức",
      description: "Đúng kiến thức môn học",
      max_score: 10,
      weight: 1,
    },
  ],
};

test("lecturer saves a reviewed draft before sending it to examination office", async ({
  page,
}) => {
  const row = { ...exam };
  let content = structuredClone(snapshot);
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    let json: unknown = {};
    if (path === "/api/auth/me")
      json = { id: "teacher", name: "Giảng viên", role: "TEACHER" };
    else if (path === "/api/admin/courses") json = [];
    else if (path === "/api/admin/users" || path === "/api/admin/results")
      json = [];
    else if (path === "/api/admin/dashboard")
      json = { courses: 1, documents: 1, exams: 1, sessions: 0 };
    else if (path === "/api/admin/examination/exams") json = [row];
    else if (path.endsWith("/roster")) json = [];
    else if (path.endsWith("/draft")) {
      if (route.request().method() === "PUT") {
        const payload = route.request().postDataJSON();
        expect(payload.questions[0].text).toBe(
          "Trình bày kiểm thử đơn vị và giải thích một ví dụ.",
        );
        content = {
          ...payload,
          questions: payload.questions.map((q: object) => ({
            ...q,
            difficulty: "EASY",
          })),
        };
      }
      json = { status: row.status, snapshot: content };
    } else if (path.endsWith("/teacher-approve")) {
      row.status = "TEACHER_APPROVED";
      json = { status: row.status };
    }
    await route.fulfill({ json });
  });
  await page.goto("/");
  await page
    .getByRole("button", { name: "Điều phối kỳ thi", exact: true })
    .click();
  await page.getByRole("button", { name: "Mở kỳ thi", exact: true }).click();
  await page
    .getByLabel("Nội dung câu hỏi")
    .fill("Trình bày kiểm thử đơn vị và giải thích một ví dụ.");
  const approve = page.getByRole("button", {
    name: "Duyệt đề & gửi khảo thí",
    exact: true,
  });
  await expect(approve).toBeDisabled();
  await page
    .getByRole("button", { name: "Lưu nội dung đã review", exact: true })
    .click();
  await expect(approve).toBeEnabled();
  await approve.click();
  await expect(page.getByText("Chờ khảo thí kiểm tra").first()).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Xác nhận đã kiểm tra đề & mở kỳ thi" }),
  ).toHaveCount(0);
});

test("examination office schedules candidates and publishes the reviewed exam", async ({
  page,
}) => {
  const row = { ...exam, status: "TEACHER_APPROVED" };
  const candidate = {
    student_id: "student",
    student_number: "0001",
    name: "Sinh viên An",
    email: "an@example.edu.vn",
    opens_at: null as number | null,
    closes_at: null as number | null,
  };
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    let json: unknown = {};
    if (path === "/api/auth/me")
      json = { id: "office", name: "Khảo thí", role: "EXAM_OFFICER" };
    else if (
      path === "/api/admin/courses" ||
      path === "/api/admin/users" ||
      path === "/api/admin/results" ||
      path === "/api/admin/examination/teachers"
    )
      json = [];
    else if (path === "/api/admin/dashboard")
      json = { courses: 1, documents: 1, exams: 1, sessions: 0 };
    else if (path === "/api/admin/examination/exams") json = [row];
    else if (path.endsWith("/roster")) json = [candidate];
    else if (path.endsWith("/draft")) json = { status: row.status, snapshot };
    else if (path.endsWith("/schedule")) {
      const data = route.request().postDataJSON();
      expect(data.student_ids).toEqual(["student"]);
      expect(data.closes_at).toBeGreaterThan(data.opens_at);
      candidate.opens_at = data.opens_at;
      candidate.closes_at = data.closes_at;
      json = { updated: 1 };
    } else if (path.endsWith("/office-approve")) {
      expect(candidate.opens_at).not.toBeNull();
      row.status = "PUBLISHED";
      json = { status: row.status };
    }
    await route.fulfill({ json });
  });
  await page.goto("/");
  await page
    .getByRole("button", { name: "Điều phối kỳ thi", exact: true })
    .click();
  await page.getByRole("button", { name: "Mở kỳ thi", exact: true }).click();
  await expect(
    page.getByRole("link", { name: "Tải template Excel" }),
  ).toHaveAttribute("href", "/api/admin/examination/template.xlsx");
  await expect(page.getByLabel("Nội dung câu hỏi")).toBeDisabled();
  await page.getByLabel("Chọn Sinh viên An", { exact: true }).check();
  await page
    .getByLabel("Giờ mở vào thi", { exact: true })
    .fill("2026-12-01T08:00");
  await page
    .getByLabel("Giờ đóng vào thi", { exact: true })
    .fill("2026-12-01T10:00");
  await page.getByRole("button", { name: "Lưu lịch thi", exact: true }).click();
  await expect(
    page.getByText("Đã lưu lịch thi.", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Xác nhận đã kiểm tra đề & mở kỳ thi" })
    .click();
  await expect(
    page.getByText("Đã công bố", { exact: true }).first(),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Xuất điểm Excel" }),
  ).toHaveAttribute("href", "/api/admin/exams/exam/grades.xlsx");
});

test("lecturer sees a highlighted low score and records an official reviewed grade", async ({
  page,
}) => {
  const row = {
    id: "sitting",
    exam_id: "exam",
    student_id: "student",
    exam_name: "Thi cuối kỳ",
    student_name: "Sinh viên An",
    status: "REVIEW_REQUIRED",
    final_score: null as number | null,
    ai_score: 4,
    low_score: true,
    attempt_number: 1,
    created_at: 1800000000,
    remaining_attempts: 0,
    max_attempts: 1,
  };
  let manual: { score: number; reason: string } | null = null;
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    let json: unknown = {};
    if (path === "/api/auth/me")
      json = { id: "teacher", name: "Giảng viên", role: "TEACHER" };
    else if (path === "/api/admin/courses" || path === "/api/admin/users")
      json = [];
    else if (path === "/api/admin/dashboard")
      json = { courses: 1, documents: 1, exams: 1, sessions: 1 };
    else if (path === "/api/admin/results") json = [row];
    else if (path.endsWith("/manual-grade")) {
      manual = route.request().postDataJSON();
      expect(manual).toEqual({
        score: 6.5,
        reason: "Đã kiểm tra audio và nội dung trả lời.",
      });
      row.final_score = 6.5;
      row.status = "COMPLETED";
      json = { status: row.status, final_score: row.final_score };
    } else if (path === "/api/admin/results/sitting")
      json = {
        ...row,
        manual_review: manual,
        history: [row],
        snapshot: {
          rubric_version: 1,
          knowledge_version: "abc123",
          ai_provider: "local",
          llm_model: "test-model",
        },
        attempts: [],
      };
    await route.fulfill({ json });
  });
  await page.goto("/");
  await page
    .getByRole("button", { name: "Kết quả & xem lại", exact: true })
    .click();
  await expect(page.locator("tr.low-score-row")).toContainText("AI: 4/10");
  await page.getByRole("button", { name: "Xem bài →", exact: true }).click();
  await page.getByLabel("Điểm chính thức (0–10)", { exact: true }).fill("6.5");
  await page
    .getByLabel("Nhận xét và lý do chấm lại", { exact: true })
    .fill("Đã kiểm tra audio và nội dung trả lời.");
  await page
    .getByRole("button", { name: "Lưu điểm chính thức", exact: true })
    .click();
  await expect(
    page.getByText("Điểm chính thức: 6.5/10", { exact: true }),
  ).toBeVisible();
});
