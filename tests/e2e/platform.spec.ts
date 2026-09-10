import { test, expect, APIRequestContext } from "@playwright/test";
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(".env", "utf8")
    .split("\n")
    .filter((x) => x.includes("=") && !x.startsWith("#"))
    .map((x) => [x.slice(0, x.indexOf("=")), x.slice(x.indexOf("=") + 1)]),
);
const password = "Synthetic-e2e-password-123";
async function post(request: APIRequestContext, path: string, data?: unknown) {
  const response = await request.post("/api" + path, { data });
  expect(response.ok(), await response.text()).toBeTruthy();
  return response.json();
}
async function setup(request: APIRequestContext) {
  await post(request, "/auth/login", {
    username: env.BOOTSTRAP_ADMIN,
    password: env.BOOTSTRAP_PASSWORD,
  });
  const suffix = Date.now().toString();
  const student = await post(request, "/admin/users", {
    username: "student.e2e." + suffix,
    name: "Sinh viên kiểm thử",
    role: "STUDENT",
    password,
  });
  const course = await post(request, "/admin/courses", {
    code: "E2E-" + suffix,
    name: "Kiểm thử luồng thi vấn đáp",
    description: "Dữ liệu kiểm thử tự động",
  });
  const base = `/admin/courses/${course.id}`;
  const lo = await post(request, base + "/outcomes", {
    code: "LO1",
    description: "Giải thích dependency injection",
  });
  const topic = await post(request, base + "/topics", {
    name: "Dependency Injection",
    learning_outcome_id: lo.id,
  });
  const upload = await request.post("/api" + base + "/documents", {
    multipart: {
      topic_id: topic.id,
      file: {
        name: "sample.txt",
        mimeType: "text/plain",
        buffer: Buffer.from(
          "Dependency Injection là kỹ thuật cung cấp dependency từ bên ngoài. Constructor injection giúp giảm coupling và hỗ trợ unit test.",
        ),
      },
    },
  });
  expect(upload.ok()).toBeTruthy();
  await expect
    .poll(
      async () => {
        const r = await request.get("/api" + base + "/workspace");
        return (await r.json()).documents[0].status;
      },
      { timeout: 30000 },
    )
    .toBe("READY");
  const rubric = await post(request, base + "/rubrics", {
    name: "Rubric kiểm thử",
    criteria: [
      {
        name: "Kiến thức",
        description: "Giải thích đúng theo tài liệu",
        max_score: 5,
        weight: 3,
      },
      { name: "Ví dụ", description: "Ví dụ hợp lý", max_score: 5, weight: 2 },
    ],
  });
  const exam = await post(request, "/admin/exams", {
    name: "Bài thi trình duyệt " + suffix,
    course_id: course.id,
    rubric_id: rubric.id,
    time_limit: 600,
    blueprint: [{ topic_id: topic.id, difficulty: "MEDIUM", count: 2 }],
  });
  await post(request, `/admin/exams/${exam.id}/publish`);
  await post(request, `/admin/exams/${exam.id}/assign`, {
    student_ids: [student.id],
  });
  return { student, exam };
}

test("login, responsive layout and admin course form", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Đăng nhập", exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: "docs/screenshots/login.png", fullPage: true });
  await page
    .getByLabel("Tên đăng nhập", { exact: true })
    .fill(env.BOOTSTRAP_ADMIN);
  await page.getByLabel("Mật khẩu", { exact: true }).fill("wrong-password");
  await page.getByRole("button", { name: "Vào không gian làm việc" }).click();
  await expect(page.locator("p[role=alert]")).toContainText("không đúng");
  await page
    .getByLabel("Mật khẩu", { exact: true })
    .fill(env.BOOTSTRAP_PASSWORD);
  await page.getByRole("button", { name: "Vào không gian làm việc" }).click();
  await expect(page.getByRole("heading", { name: /Chào/ })).toBeVisible();
  await page.screenshot({
    path: "docs/screenshots/dashboard.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Môn học & đề thi", exact: true })
    .click();
  await page.getByRole("button", { name: "Tạo môn học", exact: true }).click();
  const courseName = "Môn học tạo từ giao diện " + Date.now();
  await page.getByLabel("Mã môn học", { exact: true }).fill("UI-" + Date.now());
  await page
    .getByLabel("Tên môn học", { exact: true })
    .fill(courseName);
  await page
    .getByRole("button", { name: "Tạo môn học", exact: true })
    .last()
    .click();
  await expect(
    page.getByRole("heading", {
      name: courseName,
      exact: true,
    }),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBeTruthy();
});

test("student records only during answer, submits media, admin plays real WebM", async ({
  page,
  request,
}) => {
  const { student, exam } = await setup(request);
  await page.addInitScript(() => {
    const Recorder = window.MediaRecorder;
    (window as unknown as { recordingStarts: number }).recordingStarts = 0;
    window.MediaRecorder = class extends Recorder {
      start(timeslice?: number) {
        (window as unknown as { recordingStarts: number }).recordingStarts++;
        super.start(timeslice);
      }
    };
  });
  // Browser capture/upload/playback are real; STT is deterministic here (tested independently).
  await page.route("**/api/stt", (route) =>
    route.fulfill({
      json: {
        transcript:
          "Dependency injection cung cấp dependency từ bên ngoài và giúp kiểm thử.",
        stt_confidence: 0.96,
      },
    }),
  );
  await page.goto("/");
  await page
    .getByLabel("Tên đăng nhập", { exact: true })
    .fill(student.username);
  await page.getByLabel("Mật khẩu", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Vào không gian làm việc" }).click();
  await expect(
    page.getByRole("heading", { name: "Bài thi của tôi" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Mở bài thi" }).click();
  await page.getByRole("button", { name: "Cho phép camera & mic" }).click();
  await expect
    .poll(() =>
      page.locator("video").evaluate((v: HTMLVideoElement) => v.videoWidth),
    )
    .toBeGreaterThan(0);
  expect(
    await page.evaluate(
      () => (window as unknown as { recordingStarts: number }).recordingStarts,
    ),
  ).toBe(0);
  await page.getByRole("button", { name: "Bắt đầu thi", exact: true }).click();
  for (let i = 0; i < 2; i++) {
    await expect(
      page.getByRole("button", { name: "Bắt đầu trả lời", exact: true }),
    ).toBeEnabled();
    await page
      .getByRole("button", { name: "Bắt đầu trả lời", exact: true })
      .click();
    await expect(
      page.getByText("Đang ghi âm và ghi hình", { exact: true }),
    ).toBeVisible();
    await page.waitForTimeout(1600);
    await page
      .getByRole("button", { name: "Kết thúc trả lời", exact: true })
      .click();
    await expect(
      page.getByRole("textbox", { name: "Transcript", exact: true }),
    ).toHaveValue(/Dependency injection/);
    await page
      .getByRole("button", { name: "Nộp câu trả lời & tiếp tục" })
      .click();
    await expect(
      page.getByText(`Đã trả lời ${i + 1}/2 câu`, { exact: true }),
    ).toBeVisible();
  }
  expect(
    await page.evaluate(
      () => (window as unknown as { recordingStarts: number }).recordingStarts,
    ),
  ).toBe(4);
  await expect(
    page.getByRole("button", { name: "Nộp bài thi", exact: true }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Nộp bài thi", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Đã nộp bài thi" }),
  ).toBeVisible();
  const resultResponse = await request.get("/api/admin/results");
  const result = (await resultResponse.json()).find(
    (r: { exam_name: string }) => r.exam_name === exam.name,
  );
  await expect
    .poll(
      async () => {
        const r = await request.get("/api/admin/results/" + result.id);
        return (await r.json()).status;
      },
      { timeout: 30000 },
    )
    .toBe("REVIEW_REQUIRED");
  await page.getByRole("button", { name: "Đăng xuất", exact: true }).click();
  await page
    .getByLabel("Tên đăng nhập", { exact: true })
    .fill(env.BOOTSTRAP_ADMIN);
  await page
    .getByLabel("Mật khẩu", { exact: true })
    .fill(env.BOOTSTRAP_PASSWORD);
  await page.getByRole("button", { name: "Vào không gian làm việc" }).click();
  await page
    .getByRole("button", { name: "Kết quả & xem lại", exact: true })
    .click();
  await page
    .getByRole("row")
    .filter({ hasText: exam.name })
    .getByRole("button", { name: "Xem bài" })
    .click();
  await expect(
    page
      .getByText(
        "Dependency injection cung cấp dependency từ bên ngoài và giúp kiểm thử.",
        { exact: true },
      )
      .first(),
  ).toBeVisible();
  const video = page.locator("video").first();
  await video.evaluate((v: HTMLVideoElement) => v.play());
  await expect
    .poll(() => video.evaluate((v: HTMLVideoElement) => v.currentTime))
    .toBeGreaterThan(0);
  const audio = page.locator("audio").first();
  await audio.evaluate((a: HTMLAudioElement) => a.play());
  await expect
    .poll(() => audio.evaluate((a: HTMLAudioElement) => a.currentTime))
    .toBeGreaterThan(0);
  await page.screenshot({
    path: "docs/screenshots/review.png",
    fullPage: true,
  });
});
