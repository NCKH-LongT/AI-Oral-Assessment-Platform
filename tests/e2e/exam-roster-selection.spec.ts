import { test, expect } from "@playwright/test";

test("office selects a class, skips existing candidates and adds students without Excel", async ({
  page,
}) => {
  const selected = new Set(["existing"]);
  const learners = [
    {
      id: "existing",
      name: "Đã có",
      username: "old",
      email: "old@example.edu",
    },
    { id: "an", name: "Nguyễn An", username: "an", email: "an@example.edu" },
    {
      id: "binh",
      name: "Trần Bình",
      username: "binh",
      email: "binh@example.edu",
    },
  ];
  let received: unknown;
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    let json: unknown = [];
    if (path.endsWith("/auth/me"))
      json = { id: "office", name: "Khảo thí", role: "EXAM_OFFICER" };
    else if (path.endsWith("/dashboard"))
      json = { courses: 1, documents: 0, exams: 1, sessions: 0 };
    else if (path === "/api/admin/courses")
      json = [
        { id: "course", code: "SWT301", name: "Kiểm thử", status: "ACTIVE" },
      ];
    else if (path === "/api/admin/examination/exams")
      json = [
        {
          id: "exam",
          name: "Cuối kỳ",
          course_id: "course",
          course_name: "Kiểm thử",
          time_limit: 900,
          status: "DRAFT",
        },
      ];
    else if (path.endsWith("/classes"))
      json = [{ id: "class", name: "SE1801", student_count: 2 }];
    else if (path.endsWith("/roster-candidates")) {
      json = learners
        .filter((s) => !url.searchParams.get("class_id") || s.id !== "binh")
        .map((s) => ({ ...s, assigned: selected.has(s.id) }));
    } else if (path.endsWith("/select-students")) {
      received = route.request().postDataJSON();
      for (const id of (received as { student_ids: string[] }).student_ids)
        selected.add(id);
      json = { added: 1, skipped: 0 };
    } else if (path.endsWith("/roster"))
      json = learners
        .filter((s) => selected.has(s.id))
        .map((s) => ({
          ...s,
          student_id: s.id,
          opens_at: null,
          closes_at: null,
        }));
    await route.fulfill({ json });
  });
  await page.goto("/");
  await page
    .getByRole("button", { name: "Điều phối kỳ thi", exact: true })
    .click();
  await page.getByRole("button", { name: "Mở kỳ thi Cuối kỳ", exact: true }).click();
  await page.getByRole("button", { name: /^Sinh viên & lịch thi/ }).click();
  await page
    .getByRole("combobox", { name: "Lớp học phần", exact: true })
    .selectOption("class");
  await expect(
    page.getByText("2 học viên · 1 đã có trong kỳ thi · 0 đang chọn."),
  ).toBeVisible();
  await page
    .getByLabel("Chọn tất cả học viên đang hiển thị chưa có trong kỳ thi")
    .check();
  await page
    .getByRole("button", { name: "Thêm 1 học viên vào kỳ thi" })
    .click();
  await expect(
    page.getByText("Đã thêm 1 học viên; bỏ qua 0 học viên đã có.", {
      exact: true,
    }),
  ).toBeVisible();
  expect(received).toEqual({
    course_id: "course",
    class_id: "class",
    student_ids: ["an"],
  });
  await expect(
    page.getByRole("heading", { name: "Danh sách sinh viên (2)" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Nhập danh sách Excel" }),
  ).toBeVisible();
});
