import { test, expect } from "@playwright/test";

test("storage cleanup defaults to preserving scores, filters and confirms a preview", async ({
  page,
}) => {
  let removed = false;
  let filtered = false;
  const mutations: unknown[] = [];
  await page.route("**/api/**", (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    let json: unknown = [];
    if (path === "/api/auth/me")
      json = { id: "admin", name: "Admin", role: "ADMIN" };
    if (path === "/api/admin/dashboard")
      json = { courses: 1, exams: 1, documents: 1, sessions: 2 };
    if (path === "/api/admin/courses")
      json = [
        { id: "course", code: "EN01", name: "English", status: "ACTIVE" },
      ];
    if (path === "/api/admin/users")
      json = [
        { id: "student", name: "Student", email: "student@example.test" },
      ];
    if (path === "/api/admin/storage") {
      filtered =
        url.searchParams.get("course_id") === "course" &&
        url.searchParams.get("student_id") === "student";
      json = {
        rows: [
          {
            id: "done",
            exam_name: "English oral",
            course_code: "EN01",
            student_name: "Student",
            student_email: "student@example.test",
            attempt_number: 1,
            status: "COMPLETED",
            created_at: 1700000000,
            media_bytes: removed ? 0 : 2048,
            pending_bytes: 0,
            files: removed ? 0 : 1,
            can_clean: true,
            media_removed_at: removed ? 1700000001 : null,
          },
          {
            id: "active",
            exam_name: "English oral",
            course_code: "EN01",
            student_name: "Student",
            attempt_number: 2,
            status: "IN_PROGRESS",
            created_at: 1700000000,
            media_bytes: 0,
            files: 0,
            can_clean: false,
          },
        ],
        total: 2,
        page: 1,
        limit: 50,
        media_bytes: removed ? 0 : 2048,
        files: removed ? 0 : 1,
        backend: "local",
        by_course: [],
        by_student: [],
        cleanup: {
          files: removed ? 1 : 0,
          estimated_bytes: removed ? 2048 : 0,
          unknown_size: 0,
          retrying: 0,
        },
        local: {
          staging_bytes: 0,
          objects_bytes: 2048,
          disk_total: 100000,
          disk_free: 50000,
        },
      };
    }
    if (path === "/api/admin/storage/preview") {
      expect(route.request().postDataJSON()).toEqual({
        session_ids: ["done"],
        mode: "MEDIA",
      });
      json = {
        token: "signed-preview",
        sessions: 1,
        files: 1,
        media_bytes: 2048,
        staging_bytes: 0,
        mode: "MEDIA",
        confirmation: "XOA 1",
      };
    }
    if (path === "/api/admin/storage/cleanup") {
      mutations.push(route.request().postDataJSON());
      removed = true;
      json = { message: "Đã ghi nhận. Worker sẽ xóa file." };
    }
    return route.fulfill({ json });
  });
  await page.goto("/");
  await page
    .getByRole("button", { name: "Lần thi & dung lượng", exact: true })
    .click();
  await page.getByLabel("Môn học").selectOption("course");
  await page.getByLabel("Người làm bài").selectOption("student");
  await expect(
    page.getByRole("link", { name: "Xuất báo cáo dung lượng Excel" }),
  ).toHaveAttribute("href", /course_id=course&student_id=student/);
  await expect(
    page.getByRole("checkbox", { name: /Chọn lần 2/ }),
  ).toBeDisabled();
  await expect(page.getByLabel("Dữ liệu cần xóa")).toHaveValue("MEDIA");
  await page.getByRole("checkbox", { name: /Chọn lần 1/ }).check();
  await page.getByRole("button", { name: "Xem trước dữ liệu sẽ xóa" }).click();
  const confirm = page.getByRole("button", { name: "Xác nhận xóa dữ liệu" });
  await expect(confirm).toBeDisabled();
  await page.getByLabel("Lý do dọn dữ liệu").fill("Dọn bản ghi cũ");
  await page.getByLabel("Nhập XOA 1 để xác nhận").fill("XOA 1");
  await confirm.click();
  await expect(page.getByText(/Đã dọn bản ghi/)).toBeVisible();
  expect(filtered).toBe(true);
  expect(mutations).toEqual([
    {
      token: "signed-preview",
      confirmation: "XOA 1",
      reason: "Dọn bản ghi cũ",
    },
  ]);
});

test("Excel errors block import and a changed file requires another preview", async ({
  page,
}) => {
  let valid = false;
  let applied = 0;
  await page.route("**/api/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    let json: unknown = [];
    if (path === "/api/auth/me")
      json = { id: "admin", name: "Admin", role: "ADMIN" };
    if (path === "/api/admin/dashboard")
      json = { courses: 0, exams: 0, documents: 0, sessions: 0 };
    if (path.startsWith("/api/admin/imports/courses")) {
      if (path.endsWith("/preview")) {
        json = {
          valid,
          rows: 1,
          create: valid ? 1 : 0,
          skip: 0,
          errors: valid
            ? []
            : [{ row: 2, message: "Mã môn bị lặp trong file" }],
          items: valid ? [{ label: "ENG101", action: "create" }] : [],
        };
      } else {
        applied++;
        json = { valid: true, create: 1, skip: 0 };
      }
    }
    return route.fulfill({ json });
  });
  await page.goto("/");
  await page
    .getByRole("button", { name: "Môn học & đề thi", exact: true })
    .click();
  await page.getByText("Nhập môn học từ Excel", { exact: true }).click();
  await expect(
    page.getByRole("link", { name: "Tải mẫu Excel môn học" }),
  ).toHaveAttribute("href", "/api/admin/imports/courses/template.xlsx");
  const file = page.getByLabel("File Excel môn học");
  await file.setInputFiles({
    name: "invalid.xlsx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: Buffer.from("mock"),
  });
  await page.getByRole("button", { name: "Kiểm tra file môn học" }).click();
  await expect(
    page.getByText("Dòng 2: Mã môn bị lặp trong file"),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Nhập 0 môn học", exact: true }),
  ).toBeDisabled();
  valid = true;
  await file.setInputFiles({
    name: "valid.xlsx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: Buffer.from("mock-fixed"),
  });
  await expect(page.getByLabel("Kết quả kiểm tra môn học")).toHaveCount(0);
  await page.getByRole("button", { name: "Kiểm tra file môn học" }).click();
  await page
    .getByRole("button", { name: "Nhập 1 môn học", exact: true })
    .click();
  await expect(
    page.getByText("Đã tạo 1, bỏ qua 0 bản ghi giống dữ liệu đã có."),
  ).toBeVisible();
  expect(applied).toBe(1);
});

test("teacher has no storage or staff-account import controls", async ({
  page,
}) => {
  await page.route("**/api/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    const json =
      path === "/api/auth/me"
        ? { id: "teacher", name: "Teacher", role: "TEACHER" }
        : path === "/api/admin/dashboard"
          ? { courses: 0, exams: 0, documents: 0, sessions: 0 }
          : [];
    return route.fulfill({ json });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Người dùng", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Lần thi & dung lượng", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByText("Nhập giảng viên từ Excel", { exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByText("Nhập khảo thí từ Excel", { exact: true }),
  ).toHaveCount(0);
});
