import { test, expect } from "@playwright/test";
import { createHash } from "node:crypto";
import type { ExamSession } from "../../apps/admin-web/components/api";

test("web defaults to original audio, shows the picture and submits the same recording", async ({
  page,
}) => {
  let sttHash = "";
  let uploadedHash = "";
  const session: ExamSession = {
    id: "session",
    attempt_number: 1,
    exam_name: "TOEIC Speaking",
    practice: false,
    status: "DEVICE_CHECK",
    started_at: null,
    time_limit: 1800,
    server_time: Date.now() / 1000,
    final_score: null,
    grading_message: null,
    question_count: 1,
    answered_count: 0,
    current_attempt: null,
  };
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === "/api/auth/me")
      return route.fulfill({
        json: { id: "student", name: "Student", role: "STUDENT" },
      });
    if (path === "/api/exams/available")
      return route.fulfill({
        json: [
          {
            id: "exam",
            name: session.exam_name,
            time_limit: 1800,
            question_count: 1,
            status: "ASSIGNED",
          },
        ],
      });
    if (path === "/api/stt/config")
      return route.fulfill({
        json: { provider: "gemini", language: "en", preprocessing: "denoise" },
      });
    if (path === "/api/stt") {
      const form = await new Response(
        new Uint8Array(request.postDataBuffer()!),
        {
          headers: { "content-type": request.headers()["content-type"] },
        },
      ).formData();
      expect(form.get("preprocessing")).toBe("off");
      expect(form.get("session_id")).toBe("session");
      const file = form.get("file") as File;
      sttHash = createHash("sha256")
        .update(Buffer.from(await file.arrayBuffer()))
        .digest("hex");
      return route.fulfill({
        json: {
          transcript: "Three people are meeting in an office.",
          stt_confidence: 0.9,
        },
      });
    }
    if (path.endsWith("/session/start")) {
      session.status = "IN_PROGRESS";
      session.started_at = Date.now() / 1000;
      session.current_attempt = {
        id: "attempt",
        sequence: 1,
        text: "Describe the illustration.\nSpeak in English.",
        status: "READY",
        prompt_image: "/practice/toeic-speaking/office.svg",
      };
    }
    if (path === "/api/uploads/init") {
      const body = request.postDataJSON();
      if (body.kind === "AUDIO") uploadedHash = body.sha256;
      return route.fulfill({
        json: { id: body.kind, chunk_size: 4194304, status: "COMPLETED" },
      });
    }
    if (path.endsWith("/attempt/submit")) {
      session.current_attempt = null;
      session.answered_count = 1;
      return route.fulfill({ json: { status: "SUBMITTED" } });
    }
    if (path.startsWith("/api/exam-sessions"))
      return route.fulfill({ json: session });
    return route.fulfill({ json: { status: "STARTED" } });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Mở bài thi" }).click();
  const startExam = page.getByRole("button", {
    name: "Bắt đầu thi",
    exact: true,
  });
  await expect(startExam).toBeDisabled();
  await page.getByRole("button", { name: "Cho phép camera & mic" }).click();
  await expect(
    page.getByRole("slider", { name: "Gain microphone", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Kiểm tra độ ồn", exact: true }),
  ).toBeVisible();
  // Browser users retain the pre-exam test/skip gate.
  await expect(startExam).toBeDisabled();
  await page
    .getByRole("button", { name: "Bỏ qua kiểm tra độ ồn", exact: true })
    .click();
  await expect(
    page.getByRole("checkbox", {
      name: "Lọc nhiễu RNNoise khi nhận dạng câu trả lời",
    }),
  ).not.toBeChecked();
  await expect(startExam).toBeEnabled();
  await startExam.click();
  const picture = page.getByRole("img", {
    name: "Tranh minh họa cho câu hỏi mô tả bằng tiếng Anh",
  });
  await expect(picture).toBeVisible();
  await expect
    .poll(() => picture.evaluate((img: HTMLImageElement) => img.naturalWidth))
    .toBe(960);
  await expect(page.locator(".question-text")).toHaveCSS(
    "white-space",
    "pre-line",
  );
  await page
    .getByRole("button", { name: "Bắt đầu trả lời", exact: true })
    .click();
  await page.waitForTimeout(1200);
  await page
    .getByRole("button", { name: "Kết thúc trả lời", exact: true })
    .click();
  await expect(page.getByRole("textbox", { name: "Transcript" })).toHaveValue(
    "Three people are meeting in an office.",
  );
  await expect(
    page.getByRole("combobox", { name: "Bản ghi dùng cho STT" }),
  ).toHaveValue("original");
  await page
    .getByRole("button", { name: "Nộp câu trả lời & tiếp tục" })
    .click();
  await expect.poll(() => uploadedHash).toBe(sttHash);
  expect(sttHash).toMatch(/^[a-f0-9]{64}$/);
});
