import { test, expect } from "@playwright/test";

const image = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAHgAAABQCAIAAABd+SbeAAAAqElEQVR4nO3QAQkAIADAMLsY1kIGtIXCHTzA2Zhr60Lj+cEngQbdCjToVqBBtwINuhVo0K1Ag24FGnQr0KBbgQbdCjToVqBBtwINuhVo0K1Ag24FGnQr0KBbgQbdCjToVqBBtwINuhVo0K1Ag24FGnQr0KBbgQbdCjToVqBBtwINuhVo0K1Ag24FGnQr0KBbgQbdCjToVqBBtwINuhVo0K1Ag24FGnSrA7bQR/5SJVK6AAAAAElFTkSuQmCC",
  "base64",
);
for (const role of ["ADMIN", "TEACHER", "EXAM_OFFICER"]) {
  test(`${role} edits one question with formatting and a persistent embedded image`, async ({
    page,
  }) => {
    await page.setViewportSize({
      width: role === "EXAM_OFFICER" ? 390 : 1440,
      height: 1000,
    });
    const exam = {
      id: "e",
      name: "English pictures",
      status: "GENERATED",
      course_id: "c",
      course_name: "English",
      time_limit: 600,
    };
    const question = {
      text: "Describe the picture in detail.",
      difficulty: "EASY",
      expected_concepts: ["Describe the scene"],
      reference_chunk_ids: ["chunk"],
      english_terms: [],
      preparation_seconds: 10,
      recording_seconds: 60,
    };
    let snapshot = {
      questions: [
        question,
        { ...question, text: "Second question remains unchanged." },
      ],
      criteria: [
        {
          name: "Ideas",
          description: "Relevant ideas",
          max_score: 10,
          weight: 1,
        },
      ],
    };
    let writes = 0;
    await page.route("**/api/**", async (route) => {
      const path = new URL(route.request().url()).pathname;
      let json: unknown = [];
      if (path === "/api/auth/me") json = { id: "u", name: "Staff", role };
      if (path.endsWith("/dashboard"))
        json = { courses: 1, documents: 1, exams: 1, sessions: 0 };
      if (path === "/api/admin/examination/exams") json = [exam];
      if (path.endsWith("/draft")) {
        if (route.request().method() === "PUT") {
          snapshot = route.request().postDataJSON();
          writes++;
        }
        json = { status: "GENERATED", snapshot };
      }
      await route.fulfill({ json });
    });
    await page.goto("/");
    await page
      .getByRole("button", { name: "Điều phối kỳ thi", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Mở kỳ thi English pictures" })
      .click();
    await expect(
      page.getByRole("textbox", { name: "Nội dung câu hỏi" }),
    ).toHaveCount(0);
    await page.getByRole("button", { name: "Sửa câu 1", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Sửa câu 2", exact: true }),
    ).toBeDisabled();
    const editor = page.getByRole("textbox", { name: "Nội dung câu hỏi" });
    await editor.fill("Describe this office and the people in it.");
    await editor.press("ControlOrMeta+a");
    await page.getByRole("button", { name: "Đậm", exact: true }).click();
    await editor.press("End");
    await page
      .getByLabel("Chọn ảnh câu hỏi")
      .setInputFiles({
        name: "office.png",
        mimeType: "image/png",
        buffer: image,
      });
    await expect(editor.getByRole("img")).toHaveCount(1);
    await page.getByRole("button", { name: "Xong câu 1", exact: true }).click();
    await expect(
      page.getByRole("textbox", { name: "Nội dung câu hỏi" }),
    ).toHaveCount(0);
    await expect(page.getByRole("img", { name: "office.png" })).toBeVisible();
    await page.getByRole("button", { name: "Lưu nội dung đã review" }).click();
    await expect.poll(() => writes).toBe(1);
    expect(snapshot.questions[1].text).toBe(
      "Second question remains unchanged.",
    );
    expect(JSON.stringify(snapshot.questions[0])).toContain('"type":"bold"');
    expect(JSON.stringify(snapshot.questions[0])).toContain(
      "data:image/jpeg;base64,",
    );
    if (role === "EXAM_OFFICER")
      await expect(
        page.getByRole("button", { name: "Duyệt đề & gửi khảo thí" }),
      ).toHaveCount(0);
    await page.getByRole("button", { name: "Sửa câu 1", exact: true }).click();
    await editor.fill("An unsaved change that must be cancelled.");
    await page
      .getByRole("button", { name: "Hủy sửa câu 1", exact: true })
      .click();
    await expect(page.getByRole("img", { name: "office.png" })).toBeVisible();
    await page
      .getByRole("button", { name: "Điều phối kỳ thi", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Mở kỳ thi English pictures" })
      .click();
    await expect(page.getByRole("img", { name: "office.png" })).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBeTruthy();
    await page.screenshot({
      path: `test-results/question-editor-${role}.png`,
      fullPage: true,
    });
  });
}

test("recent attempts opens the selected student's exact sitting and keeps menu reset", async ({
  page,
}) => {
  const results = ["An", "Bình"].map((name, i) => ({
    id: `s${i}`,
    student_name: name,
    exam_name: "Speaking",
    attempt_number: i + 1,
    status: "COMPLETED",
    final_score: 8,
  }));
  const opened: string[] = [];
  await page.route("**/api/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    let json: unknown = [];
    if (path === "/api/auth/me")
      json = { id: "admin", name: "Admin", role: "ADMIN" };
    if (path.endsWith("/dashboard"))
      json = { courses: 0, documents: 0, exams: 1, sessions: 2 };
    if (path === "/api/admin/results") json = results;
    if (path.startsWith("/api/admin/results/s")) {
      const result = results.find((r) => path.endsWith(r.id))!;
      opened.push(result.id);
      json = {
        ...result,
        snapshot: {
          rubric_version: 1,
          ai_provider: "demo",
          knowledge_version: "test",
        },
        attempts: [],
        history: [result],
      };
    }
    return route.fulfill({ json });
  });
  await page.goto("/");
  await page
    .getByRole("row")
    .filter({ hasText: "Bình" })
    .getByRole("button", { name: "Xem bài →" })
    .click();
  await expect(
    page.getByText("BÀI THI CỦA Bình", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Speaking · Lần 2" }),
  ).toBeVisible();
  expect(opened).toEqual(["s1"]);
  await page.getByRole("button", { name: "Tổng quan", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Lượt thi gần đây" }),
  ).toBeVisible();
});
