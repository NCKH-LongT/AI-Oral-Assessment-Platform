import { test, expect } from "@playwright/test";

const course = {
  id: "course",
  code: "SE101",
  name: "Software Engineering",
  description: "",
  status: "ACTIVE",
};
const teacher = {
  id: "teacher",
  username: "teacher",
  name: "Giảng viên An",
  role: "TEACHER",
};
const student = {
  id: "student",
  username: "sv001",
  name: "Sinh viên Bình",
  email: "binh@example.test",
  role: "STUDENT",
};

test("officer creates a department, class and scheduled bank exam, then inspects class results", async ({
  page,
}) => {
  const departments: Record<string, unknown>[] = [];
  const classes: Record<string, unknown>[] = [];
  const rounds: Record<string, unknown>[] = [];
  let members: unknown[] = [];
  let departmentId: string | null = null;
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const method = route.request().method();
    let json: unknown = [];
    if (path === "/api/auth/me")
      json = { id: "officer", name: "Khảo thí", role: "EXAM_OFFICER" };
    else if (path === "/api/admin/courses")
      json = [{ ...course, department_id: departmentId }];
    else if (path === "/api/admin/dashboard")
      json = { courses: 1, exams: 1, sessions: 0, documents: 0 };
    else if (path === "/api/admin/users") json = [student];
    else if (path === "/api/admin/examination/teachers") json = [teacher];
    else if (path === "/api/admin/departments") {
      if (method === "POST")
        departments.push({
          id: "department",
          ...route.request().postDataJSON(),
        });
      json = method === "GET" ? departments : { id: "department" };
    } else if (path.endsWith("/department")) {
      departmentId = route.request().postDataJSON().department_id;
      json = { ok: true };
    } else if (path === "/api/admin/classes") {
      if (method === "POST")
        classes.push({
          id: "class",
          ...route.request().postDataJSON(),
          course_name: course.name,
          teacher_name: teacher.name,
          student_count: 0,
        });
      json = method === "GET" ? classes : classes[0];
    } else if (path === "/api/admin/classes/class")
      json = {
        ...classes[0],
        students: members,
        rounds,
        bank: [
          {
            id: "bank",
            name: "Đề giữa kỳ",
            category: "Giữa kỳ",
            rubric_name: "Rubric nội dung",
          },
        ],
      };
    else if (path.endsWith("/classes/class/students")) {
      expect(route.request().postDataJSON().student_ids).toEqual(["student"]);
      members = [{ ...student, student_number: "001" }];
      json = { ok: true };
    } else if (path.endsWith("/classes/class/rounds")) {
      const body = route.request().postDataJSON();
      expect(body.exam_id).toBe("bank");
      expect(body.closes_at).toBeGreaterThan(body.opens_at);
      rounds.push({ id: "round", ...body });
      json = { id: "round" };
    } else if (path.endsWith("/rounds/round/results"))
      json = [
        {
          student_id: "student",
          student_name: student.name,
          student_number: "001",
          sessions: [],
        },
      ];
    await route.fulfill({ json });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Bộ môn", exact: true }).click();
  await page.getByRole("button", { name: "Tạo bộ môn", exact: true }).click();
  await page.getByLabel("Mã bộ môn").fill("CNTT");
  await page.getByLabel("Tên bộ môn").fill("Công nghệ thông tin");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Lưu", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "CNTT · Công nghệ thông tin" }),
  ).toBeVisible();
  await page.getByLabel("Bộ môn", { exact: true }).selectOption("department");
  await page.getByRole("button", { name: "Lưu", exact: true }).click();
  await expect.poll(() => departmentId).toBe("department");
  await page.getByRole("button", { name: "Lớp học", exact: true }).click();
  await page.getByRole("button", { name: "Tạo lớp học", exact: true }).click();
  await page.getByLabel("Mã lớp", { exact: true }).fill("SE101-01");
  await page.getByLabel("Tên lớp", { exact: true }).fill("Lớp phần mềm");
  await page.getByLabel("Giảng viên phụ trách").selectOption("teacher");
  await page.getByLabel("Bắt đầu lớp").fill("2026-10-01T08:00");
  await page.getByLabel("Kết thúc lớp").fill("2026-12-31T17:00");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Lưu", exact: true })
    .click();
  await page.getByRole("button", { name: "Mở lớp", exact: true }).click();
  await page.getByRole("button", { name: "Sinh viên (0)" }).click();
  await page
    .getByText("Thêm sinh viên đã có tài khoản", { exact: true })
    .click();
  await page
    .getByLabel("Sinh viên (có thể chọn nhiều)")
    .selectOption(["student"]);
  await page.getByRole("button", { name: "Thêm vào lớp", exact: true }).click();
  await expect(
    page.getByRole("cell", { name: student.name, exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Đợt thi & kết quả" }).click();
  await page.getByText("Tạo đợt thi từ ngân hàng đề", { exact: true }).click();
  await page.getByLabel("Tên đợt thi").fill("Kiểm tra giữa kỳ");
  await page.getByLabel("Mở thi", { exact: true }).fill("2026-10-20T08:00");
  await page.getByLabel("Đóng thi", { exact: true }).fill("2026-10-20T10:00");
  await page.getByRole("button", { name: "Tạo đợt thi", exact: true }).click();
  await page.getByLabel("Chọn đợt thi", { exact: true }).selectOption("round");
  await expect(page.getByText("Chưa thi", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("cell", { name: student.name, exact: true }),
  ).toBeVisible();
});

test("assigned teacher sees class results and grading without class management controls", async ({
  page,
}) => {
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const row = {
      id: "class",
      code: "SE101-01",
      name: "Lớp phần mềm",
      course_id: "course",
      course_name: course.name,
      teacher_id: "teacher",
      teacher_name: teacher.name,
      starts_at: 1791000000,
      ends_at: 1798000000,
      student_count: 1,
    };
    let json: unknown = [];
    if (path === "/api/auth/me") json = teacher;
    else if (path.endsWith("/dashboard"))
      json = { courses: 0, exams: 0, sessions: 0, documents: 0 };
    else if (path === "/api/admin/classes") json = [row];
    else if (path === "/api/admin/classes/class")
      json = {
        ...row,
        students: [student],
        rounds: [
          {
            id: "round",
            name: "Giữa kỳ",
            opens_at: 1791000000,
            closes_at: 1791007200,
          },
        ],
        bank: [],
      };
    else if (path.endsWith("/rounds/round/results"))
      json = [
        {
          student_id: "student",
          student_name: student.name,
          sessions: [
            {
              id: "session",
              attempt_number: 1,
              status: "COMPLETED",
              final_score: 8,
            },
          ],
        },
      ];
    else if (path === "/api/admin/results/session")
      json = {
        id: "session",
        student_name: student.name,
        exam_name: "Giữa kỳ",
        status: "COMPLETED",
        final_score: 8,
        snapshot: {
          rubric_version: 1,
          ai_provider: "demo",
          knowledge_version: "test",
        },
        attempts: [],
      };
    await route.fulfill({ json });
  });
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Bộ môn", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Lớp được phân công", exact: true })
    .click();
  await expect(page.getByRole("button", { name: "Tạo lớp học" })).toHaveCount(
    0,
  );
  await page.getByRole("button", { name: "Mở lớp", exact: true }).click();
  await expect(
    page.getByText("Tạo đợt thi từ ngân hàng đề", { exact: true }),
  ).toHaveCount(0);
  await page.getByLabel("Chọn đợt thi", { exact: true }).selectOption("round");
  await page.getByRole("button", { name: "Xem bài / chấm lại" }).click();
  await expect(
    page.getByRole("heading", { name: "Giảng viên chấm lại" }),
  ).toBeVisible();
});

test("user table searches and filters roles on a compact screen", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    let json: unknown = [];
    if (path === "/api/auth/me")
      json = { id: "admin", name: "Admin", role: "ADMIN" };
    else if (path.endsWith("/dashboard"))
      json = { courses: 0, exams: 0, sessions: 0, documents: 0 };
    else if (path === "/api/admin/users") json = [teacher, student];
    await route.fulfill({ json });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Người dùng", exact: true }).click();
  await page.screenshot({
    path: test.info().outputPath("users-compact.png"),
    fullPage: true,
  });
  await page.getByLabel("Tìm người dùng").fill("binh@example.test");
  await expect(
    page.getByRole("cell", { name: student.name, exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("cell", { name: teacher.name, exact: true }),
  ).toHaveCount(0);
  await page.getByLabel("Tìm người dùng").fill("");
  await page.getByLabel("Lọc vai trò").selectOption("TEACHER");
  await expect(
    page.getByRole("cell", { name: teacher.name, exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("cell", { name: student.name, exact: true }),
  ).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test("bank filters by category and rubric and officer approves reusable exams without a roster", async ({
  page,
}) => {
  const exams = [
    {
      id: "first",
      name: "Đề giữa kỳ",
      category: "Giữa kỳ",
      rubric_id: "rubric1",
      status: "PUBLISHED",
      workflow: true,
      max_attempts: 1,
      time_limit: 900,
      blueprint: [],
      questions: [],
    },
    {
      id: "second",
      name: "Đề cuối kỳ",
      category: "Cuối kỳ",
      rubric_id: "rubric2",
      status: "TEACHER_APPROVED",
      workflow: true,
      max_attempts: 1,
      time_limit: 900,
      blueprint: [],
      questions: [],
    },
  ];
  let approved = false;
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    let json: unknown = [];
    if (path === "/api/auth/me")
      json = { id: "officer", name: "Khảo thí", role: "EXAM_OFFICER" };
    else if (path === "/api/admin/courses") json = [course];
    else if (path.endsWith("/dashboard"))
      json = { courses: 1, exams: 2, documents: 0, sessions: 0 };
    else if (path.endsWith("/workspace"))
      json = {
        outcomes: [],
        chapters: [],
        documents: [],
        topics: [],
        rubrics: [
          { id: "rubric1", name: "Nội dung", criteria: [] },
          { id: "rubric2", name: "Lập luận", criteria: [] },
        ],
        exams,
      };
    else if (path.endsWith("/draft"))
      json = {
        status: "TEACHER_APPROVED",
        snapshot: { questions: [], criteria: [] },
      };
    else if (path.endsWith("/second/bank-approve")) {
      approved = true;
      exams[1].status = "PUBLISHED";
      json = { status: "PUBLISHED" };
    }
    await route.fulfill({ json });
  });
  await page.goto("/");
  await page
    .getByRole("button", { name: "Ngân hàng đề thi", exact: true })
    .click();
  await page.getByRole("button", { name: /Software Engineering/ }).click();
  await page
    .getByRole("combobox", { name: "Category", exact: true })
    .selectOption("Giữa kỳ");
  await expect(
    page.getByRole("heading", { name: "Đề giữa kỳ", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Đề cuối kỳ", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("combobox", { name: "Category", exact: true })
    .selectOption("");
  await page
    .getByRole("combobox", { name: "Rubric", exact: true })
    .selectOption("rubric2");
  await expect(
    page.getByRole("heading", { name: "Đề giữa kỳ", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Duyệt vào ngân hàng đề", exact: true })
    .click();
  await expect.poll(() => approved).toBe(true);
  await expect(
    page.getByRole("button", { name: "Duyệt vào ngân hàng đề", exact: true }),
  ).toHaveCount(0);
});
