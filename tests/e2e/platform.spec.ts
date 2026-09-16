import { test, expect, APIRequestContext } from "@playwright/test";
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(".env", "utf8")
    .split("\n")
    .filter((x) => x.includes("=") && !x.startsWith("#"))
    .map((x) => [x.slice(0, x.indexOf("=")), x.slice(x.indexOf("=") + 1)]),
);
const password = "Synthetic-e2e-password-123";

function textbookPDF() {
  const content = (text: string) => `BT /F1 18 Tf 50 720 Td (${text}) Tj ET`;
  const a = content("Chapter 1: Injection"),
    b = content("Chapter 2: Databases");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R 6 0 R] /Count 2 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${a.length} >>\nstream\n${a}\nendstream`,
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 7 0 R >>",
    `<< /Length ${b.length} >>\nstream\n${b}\nendstream`,
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((o, i) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets
    .slice(1)
    .map((o) => `${String(o).padStart(10, "0")} 00000 n \n`)
    .join("");
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf);
}
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
    name: "Kiểm thử luồng thi vấn đáp " + suffix,
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
  return { student, exam, course };
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
  await page.getByLabel("Tên môn học", { exact: true }).fill(courseName);
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
  await page
    .getByRole("button")
    .filter({
      has: page.getByRole("heading", { name: courseName, exact: true }),
    })
    .click();
  await page.getByLabel("File giáo trình (tối đa 100 MB)").setInputFiles({
    name: "textbook.pdf",
    mimeType: "application/pdf",
    buffer: textbookPDF(),
  });
  await page
    .getByRole("button", { name: "Tải giáo trình PDF", exact: true })
    .click();
  await expect(
    page.getByText("Chapter 1: Injection", { exact: true }),
  ).toBeVisible({ timeout: 30000 });
  await page.getByRole("button", { name: "Chuẩn đầu ra", exact: true }).click();
  for (const code of ["LO1", "LO2"]) {
    await page.getByLabel("Mã LO", { exact: true }).fill(code);
    await page
      .getByLabel("Mô tả chuẩn đầu ra", { exact: true })
      .fill("Explain " + code);
    await page
      .getByRole("button", { name: "Thêm chuẩn đầu ra", exact: true })
      .click();
    await expect(page.getByText(code, { exact: true })).toBeVisible();
  }
  await page
    .getByRole("button", { name: "Tài liệu bổ sung", exact: true })
    .click();
  for (const name of ["notes-a.txt", "notes-b.txt"]) {
    await page.getByLabel("Tài liệu (tối đa 20 MB)").setInputFiles({
      name,
      mimeType: "text/plain",
      buffer: Buffer.from("Dependency injection improves testability"),
    });
    await page
      .getByRole("button", { name: "Tải tài liệu lên", exact: true })
      .click();
    await expect(page.getByText(name, { exact: true }).first()).toBeVisible();
  }
  await page.getByRole("button", { name: "Chủ đề", exact: true }).click();
  await page.getByRole("button", { name: "Tạo chủ đề", exact: true }).click();
  await page
    .getByLabel("Tên chủ đề", { exact: true })
    .fill("Topic with many mappings");
  for (const group of [
    "Chuẩn đầu ra (chọn ít nhất 1)",
    "Chương/mục giáo trình (chọn ít nhất 1)",
    "Tài liệu bổ sung (có thể chọn nhiều)",
  ]) {
    const choices = page
      .getByRole("group", { name: group })
      .getByRole("checkbox");
    await expect(choices).toHaveCount(2);
    for (const choice of await choices.all()) await choice.check();
  }
  await page.getByRole("button", { name: "Thêm chủ đề", exact: true }).click();
  await expect(
    page.getByText("2 tài liệu bổ sung · 2 chương/mục giáo trình"),
  ).toBeVisible();
  await page.screenshot({
    path: "docs/screenshots/knowledge.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "02 · Rubric", exact: true }).click();
  await page.getByRole("button", { name: "Tạo rubric", exact: true }).click();
  await page.getByLabel("Tên rubric", { exact: true }).fill("Rubric CRUD");
  await page.getByRole("button", { name: "Lưu rubric", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Rubric CRUD v1" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Sửa rubric Rubric CRUD", exact: true })
    .click();
  await page.getByLabel("Tên rubric", { exact: true }).fill("Rubric đã sửa");
  await page.getByRole("button", { name: "Lưu rubric", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Rubric đã sửa v2" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Sửa rubric Rubric đã sửa", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Hủy sửa rubric", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Tạo rubric", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "03 · Bài thi & giao bài", exact: true })
    .click();
  await page.getByRole("button", { name: "Tạo bài thi", exact: true }).click();
  await page.getByLabel("Tên bài thi", { exact: true }).fill("Đề CRUD");
  await page
    .getByRole("combobox", { name: "Rubric", exact: true })
    .selectOption({ label: "Rubric đã sửa · v2" });
  await page.getByRole("button", { name: "Lưu bản nháp", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Đề CRUD", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Sửa bản nháp", exact: true }).click();
  await page.getByLabel("Tên bài thi", { exact: true }).fill("Đề đã sửa");
  await page.getByRole("button", { name: "Lưu bản nháp", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Đề đã sửa", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Sao chép thành bản nháp", exact: true })
    .click();
  await expect(page.getByLabel("Tên bài thi", { exact: true })).toHaveValue(
    "Đề đã sửa (bản sao)",
  );
  await page
    .getByRole("button", { name: "Hủy sửa đề thi", exact: true })
    .click();
  page.on("dialog", (dialog) => dialog.accept());
  for (const name of ["Đề đã sửa", "Đề đã sửa (bản sao)"]) {
    await page
      .locator("section.panel")
      .filter({ has: page.getByRole("heading", { name, exact: true }) })
      .getByRole("button", { name: "Xóa", exact: true })
      .click();
    await expect(page.getByRole("heading", { name, exact: true })).toHaveCount(
      0,
    );
  }
  await page.getByRole("button", { name: "02 · Rubric", exact: true }).click();
  await page.getByRole("button", { name: "Xóa", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Rubric đã sửa v2" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Cài đặt", exact: true }).click();
  await page
    .getByLabel("Tên môn học", { exact: true })
    .fill(courseName + " đã sửa");
  await page
    .getByRole("button", { name: "Cập nhật môn học", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: courseName + " đã sửa", exact: true }),
  ).toBeVisible();
  for (const action of ["Lưu trữ môn học", "Khôi phục môn học"]) {
    await page
      .getByRole("button")
      .filter({
        has: page.getByRole("heading", {
          name: courseName + " đã sửa",
          exact: true,
        }),
      })
      .click();
    await page.getByRole("button", { name: "Cài đặt", exact: true }).click();
    await page.getByRole("button", { name: action, exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Môn học & đề thi", exact: true }),
    ).toBeVisible();
  }
  await page.getByRole("button", { name: "Tạo môn học", exact: true }).click();
  await page
    .getByLabel("Mã môn học", { exact: true })
    .fill("DELETE-" + Date.now());
  await page
    .getByLabel("Tên môn học", { exact: true })
    .fill("Môn trống để xóa");
  await page
    .getByRole("button", { name: "Tạo môn học", exact: true })
    .last()
    .click();
  await page
    .getByRole("button")
    .filter({
      has: page.getByRole("heading", { name: "Môn trống để xóa", exact: true }),
    })
    .click();
  await page.getByRole("button", { name: "Cài đặt", exact: true }).click();
  await page.getByRole("button", { name: "Xóa môn học", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Môn học & đề thi", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Môn trống để xóa", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Cấu hình hệ thống", exact: true })
    .click();
  await page
    .getByRole("button", { name: "STT & giọng nói", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Cấu hình giọng nói", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText(/Desktop luôn dùng PhoWhisper-small/),
  ).toBeVisible();
  await expect(
    page.getByLabel("File JSON service account Google (tối đa 64 KB)"),
  ).toBeHidden();
  await page.screenshot({
    path: "docs/screenshots/speech-settings.png",
    fullPage: true,
    mask: [page.getByText(/^Project:/)],
    maskColor: "#eef2ef",
  });
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
  await page.route("**/api/stt/config", (route) =>
    route.fulfill({
      json: {
        provider: "local_server",
        preprocessing: "denoise",
        language: "vi",
      },
    }),
  );
  await page.route("**/api/stt", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1200));
    await route.fulfill({
      json: {
        transcript:
          "Dependency injection cung cấp dependency từ bên ngoài và giúp kiểm thử.",
        stt_confidence: 0.96,
      },
    });
  });
  await page.route("**/api/question-attempts/*/submit", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1200));
    await route.continue();
  });
  await page.goto("/");
  await page
    .getByLabel("Tên đăng nhập", { exact: true })
    .fill(student.username);
  await page.getByLabel("Mật khẩu", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Vào không gian làm việc" }).click();
  await expect(
    page.getByRole("heading", { name: "Bài thi của tôi" }),
  ).toBeVisible();
  await page
    .locator("section.panel")
    .filter({
      has: page.getByRole("heading", { name: exam.name, exact: true }),
    })
    .getByRole("button", { name: "Mở bài thi" })
    .click();
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
  await expect(
    page.getByRole("button", { name: "Bắt đầu thi", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Bỏ qua kiểm tra độ ồn", exact: true })
    .click();
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
      page.getByRole("status").filter({ hasText: "Đang nhận dạng" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Ghi lại", exact: true }),
    ).toBeDisabled();
    await expect(
      page.getByRole("textbox", { name: "Transcript", exact: true }),
    ).toHaveValue(/Dependency injection/);
    await page
      .getByRole("button", { name: "Nộp câu trả lời & tiếp tục" })
      .click();
    await expect(
      page.getByRole("status").filter({ hasText: "Đang nộp câu trả lời" }),
    ).toBeVisible();
    await expect(
      page.getByRole("textbox", { name: "Transcript", exact: true }),
    ).toBeDisabled();
    await expect(
      page.getByText(`Đã trả lời ${i + 1}/2 câu`, { exact: true }),
    ).toBeVisible();
  }
  expect(
    await page.evaluate(
      () => (window as unknown as { recordingStarts: number }).recordingStarts,
    ),
  ).toBe(6);
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

test("admin enrolls a course, promotes a user, and configures services without exposing secrets", async ({
  page,
  request,
}) => {
  const { course, exam } = await setup(request);
  const learner = await post(request, "/admin/users", {
    username: "course.learner." + Date.now(),
    name: "Học viên giao môn",
    role: "STUDENT",
    password,
  });
  // Reuse only the admin auth cookies for this browser context.
  await page.context().addCookies((await request.storageState()).cookies);
  await page.goto("/");
  await page
    .getByRole("button", { name: "Môn học & đề thi", exact: true })
    .click();
  await page
    .getByRole("button")
    .filter({
      has: page.getByRole("heading", { name: course.name, exact: true }),
    })
    .click();
  await page
    .getByRole("button", { name: "04 · Học viên", exact: true })
    .click();
  await page
    .getByLabel("Tìm người dùng", { exact: true })
    .fill(learner.username);
  await page.getByRole("checkbox", { name: new RegExp(learner.name) }).check();
  await page
    .getByRole("button", { name: "Thêm vào môn học", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Bỏ khỏi môn", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Người dùng", exact: true }).click();
  const row = page.getByRole("row").filter({ hasText: learner.username });
  await row.getByRole("combobox").selectOption("ADMIN");
  await row.getByRole("button", { name: "Lưu quyền", exact: true }).click();
  await expect
    .poll(
      async () =>
        (await (await request.get("/api/admin/users")).json()).find(
          (u: { id: string }) => u.id === learner.id,
        ).role,
    )
    .toBe("ADMIN");
  // Return to student role to verify the student's course view.
  await row.getByRole("combobox").selectOption("STUDENT");
  await row.getByRole("button", { name: "Lưu quyền", exact: true }).click();
  await expect
    .poll(
      async () =>
        (await (await request.get("/api/admin/users")).json()).find(
          (u: { id: string }) => u.id === learner.id,
        ).role,
    )
    .toBe("STUDENT");
  await page
    .getByRole("button", { name: "Cấu hình hệ thống", exact: true })
    .click();
  const platform = await (
    await request.get("/api/admin/settings/platform")
  ).json();
  if (platform.ai_config_source === "env") {
    await expect(
      page.getByRole("heading", { name: "LLM chấm điểm trên server" }),
    ).toBeVisible();
    await expect(
      page.getByLabel("Gemini API key", { exact: true }),
    ).toHaveCount(0);
  } else {
    await page
      .getByLabel("Gemini API key", { exact: true })
      .fill("synthetic-config-test-key");
    await page
      .getByRole("button", { name: "Lưu cấu hình hệ thống", exact: true })
      .click();
    await expect(
      page.getByLabel("Gemini API key", { exact: true }),
    ).toHaveValue("");
    const settingsResponse = await (
      await request.get("/api/admin/settings/platform")
    ).text();
    expect(settingsResponse).not.toContain("synthetic-config-test-key");
    await page.getByLabel("Xóa Gemini API key đã lưu", { exact: true }).check();
    await page
      .getByRole("button", { name: "Lưu cấu hình hệ thống", exact: true })
      .click();
    await expect(
      page.getByLabel("Xóa Gemini API key đã lưu", { exact: true }),
    ).not.toBeChecked();
  }
  await page
    .getByRole("button", { name: "Đăng nhập Google", exact: true })
    .click();
  await expect(
    page.getByLabel("Google OAuth Client Secret", { exact: true }),
  ).toHaveAttribute("type", "password");
  await page.getByRole("button", { name: "Đăng xuất", exact: true }).click();
  await page
    .getByLabel("Tên đăng nhập", { exact: true })
    .fill(learner.username);
  await page.getByLabel("Mật khẩu", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Vào không gian làm việc" }).click();
  await expect(
    page.getByRole("heading", {
      name: "Thi thử: Làm quen hệ thống",
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("combobox", { name: "Môn học", exact: true })
    .selectOption(course.id);
  await expect(
    page.getByRole("heading", { name: exam.name, exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", {
      name: "Thi thử: Làm quen hệ thống",
      exact: true,
    }),
  ).toHaveCount(0);
});
