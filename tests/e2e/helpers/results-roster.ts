import type { Page } from "@playwright/test";

export async function installResultRoster(
  page: Page,
  review: {
    id: string;
    exam_name: string;
    student_name: string;
    status: string;
    final_score: number | null;
    ai_score?: number | null;
    low_score?: boolean;
  },
) {
  await page.route("**/api/admin/courses", (route) =>
    route.fulfill({
      json: [{ id: "course", code: "EN", name: "English", status: "ACTIVE" }],
    }),
  );
  await page.route("**/api/admin/courses/course/results**", (route) =>
    route.fulfill({
      json: {
        exams: [{ id: "exam", name: review.exam_name, status: "PUBLISHED" }],
        dates: [],
        attempt_numbers: [1],
        rows: [
          {
            student_id: "student",
            student_name: review.student_name,
            status: review.status,
            final_score: review.final_score,
            ai_score: review.ai_score,
            low_score: review.low_score,
            processing: null,
            session: {
              id: review.id,
              attempt_number: 1,
              created_at: 100,
              started_at: 100,
            },
          },
        ],
      },
    }),
  );
}

export async function selectResultExam(page: Page) {
  await page
    .getByRole("combobox", { name: "Môn học", exact: true })
    .selectOption("course");
  await page
    .getByRole("combobox", { name: "Đề / kỳ thi", exact: true })
    .selectOption("exam");
}
