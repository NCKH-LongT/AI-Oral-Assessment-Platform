import { test, expect } from "@playwright/test";

test("student browser sessions cannot display exams", async ({ page }) => {
  await page.route("**/api/auth/me", (r) =>
    r.fulfill({ json: { id: "s", name: "Student", role: "STUDENT" } }),
  );
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Vui lòng sử dụng OralAI Desktop" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Bài thi của tôi" }),
  ).toHaveCount(0);
});

for (const role of ["ADMIN", "EXAM_OFFICER", "TEACHER"]) {
  test(`${role} can view student detail with the appropriate course controls`, async ({
    page,
  }) => {
    const student = {
      id: "s",
      name: "Sinh viên mẫu",
      username: "sv-test",
      role: "STUDENT",
    };
    let enrolled = false;
    const mutations: string[] = [];
    await page.route("**/api/**", (r) => {
      const path = new URL(r.request().url()).pathname;
      let json: unknown = [];
      if (path === "/api/auth/me") json = { id: "staff", name: "Staff", role };
      if (path === "/api/admin/users") json = [student];
      if (path === "/api/admin/dashboard")
        json = { courses: 1, exams: 0, sessions: 0, documents: 0 };
      if (path === "/api/admin/users/s/courses")
        json = {
          student,
          courses: [
            {
              id: "c",
              code: "EN01",
              name: "English",
              status: "ACTIVE",
              enrolled,
              assigned: false,
            },
          ],
        };
      if (path === "/api/admin/users/s/courses/c") {
        mutations.push(r.request().method());
        enrolled = r.request().method() === "PUT";
        json = { ok: true };
      }
      return r.fulfill({ json });
    });
    await page.goto("/");
    await page.getByRole("button", { name: "Người dùng", exact: true }).click();
    await page.getByRole("button", { name: student.name, exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Môn học của sinh viên" }),
    ).toBeVisible();
    if (role === "TEACHER") {
      await expect(
        page.getByRole("button", { name: "Thêm môn", exact: true }),
      ).toHaveCount(0);
      return;
    }
    await page.getByLabel("Thêm môn cho sinh viên").selectOption("c");
    await page.getByRole("button", { name: "Thêm môn", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Gỡ môn", exact: true }),
    ).toBeVisible();
    page.once("dialog", (d) => d.accept());
    await page.getByRole("button", { name: "Gỡ môn", exact: true }).click();
    await expect(page.getByText("Chưa có môn được giao.")).toBeVisible();
    expect(mutations).toEqual(["PUT", "DELETE"]);
  });
}
