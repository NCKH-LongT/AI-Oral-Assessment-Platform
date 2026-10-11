import type { Page } from "@playwright/test";

// Browser media tools remain available for staff to try the assessment flow.
// Students must use the desktop bridge, covered in desktop-* and exam-screen.
export async function openWebPractice(page: Page) {
  await page.route("**/api/admin/**", (r) =>
    r.fulfill({
      json: new URL(r.request().url()).pathname.endsWith("/dashboard")
        ? { courses: 0, exams: 0, documents: 0, sessions: 0 }
        : [],
    }),
  );
  await page.goto("/");
  await page
    .getByRole("button", { name: "Học & thi thử", exact: true })
    .click();
}
