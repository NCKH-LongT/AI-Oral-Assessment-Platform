import { test, expect } from "@playwright/test";

test("desktop submits local Whisper text without server or Google STT", async ({
  page,
}) => {
  const transcript =
    "Whisper local supplies this transcript for Gemini grading.";
  let localCalls = 0;
  let submitted: unknown;
  const serverSttCalls: string[] = [];
  await page.exposeFunction("recordLocalStt", () => {
    localCalls++;
  });
  await page.addInitScript((transcript) => {
    window.oralDesktop = {
      transcribe: async (audio, policy) => {
        if (!audio.byteLength || policy.provider !== "local")
          throw new Error("Expected recorded audio and a local STT policy");
        await (
          window as unknown as { recordLocalStt: () => Promise<void> }
        ).recordLocalStt();
        return { transcript, stt_confidence: 0.99 };
      },
    };
  }, transcript);
  const session = {
    id: "session",
    exam_name: "Gemini exam",
    status: "DEVICE_CHECK",
    started_at: null as number | null,
    time_limit: 600,
    server_time: Date.now() / 1000,
    final_score: null as number | null,
    question_count: 1,
    answered_count: 0,
    current_attempt: null as {
      id: string;
      sequence: number;
      text: string;
      status: string;
    } | null,
  };
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/auth/me")
      return route.fulfill({
        json: { id: "student", role: "STUDENT", name: "Student" },
      });
    if (path === "/api/exams/available")
      return route.fulfill({
        json: [
          {
            id: "exam",
            name: "Gemini exam",
            time_limit: 600,
            question_count: 1,
            status: "ASSIGNED",
          },
        ],
      });
    if (path === "/api/stt/config")
      return route.fulfill({
        json: { provider: "google", language: "vi", preprocessing: "denoise" },
      });
    if (path === "/api/stt" || path.includes("google")) {
      serverSttCalls.push(path);
      return route.fulfill({
        status: 503,
        json: { error: { message: "Google STT not configured" } },
      });
    }
    if (path === "/api/exam-sessions/session/start") {
      session.status = "IN_PROGRESS";
      session.started_at = Date.now() / 1000;
      session.current_attempt = {
        id: "attempt",
        sequence: 1,
        text: "Explain DI.",
        status: "READY",
      };
    }
    if (path === "/api/question-attempts/attempt/submit") {
      submitted = route.request().postDataJSON();
      session.current_attempt = null;
      session.answered_count = 1;
      return route.fulfill({ json: { status: "SUBMITTED" } });
    }
    if (path === "/api/uploads/init")
      return route.fulfill({
        json: {
          id: route.request().postDataJSON().kind,
          chunk_size: 4194304,
          status: "COMPLETED",
        },
      });
    if (path === "/api/exam-sessions/session/finish") {
      session.status = "COMPLETED";
      session.final_score = 8;
    }
    if (path.startsWith("/api/exam-sessions"))
      return route.fulfill({ json: session });
    return route.fulfill({ json: { status: "STARTED" } });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Mở bài thi" }).click();
  await page.getByRole("button", { name: "Cho phép camera & mic" }).click();
  await page
    .getByRole("button", { name: "Bỏ qua kiểm tra độ ồn", exact: true })
    .click();
  await page.getByRole("button", { name: "Bắt đầu thi", exact: true }).click();
  await page
    .getByRole("button", { name: "Bắt đầu trả lời", exact: true })
    .click();
  // Wait for a real media chunk from Chromium's fake camera/mic.
  await page.waitForTimeout(1200);
  await expect(
    page.getByRole("combobox", { name: "Microphone", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("combobox", { name: "Camera", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Kết thúc trả lời", exact: true })
    .click();
  await expect(page.getByRole("textbox", { name: "Transcript" })).toHaveValue(
    transcript,
  );
  await page
    .getByRole("button", { name: "Nộp câu trả lời & tiếp tục" })
    .click();
  await expect(
    page.getByRole("button", { name: "Nộp bài thi", exact: true }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Nộp bài thi", exact: true }).click();
  await expect(page.locator(".finished")).toContainText("8/10");
  expect(localCalls).toBe(1);
  expect(submitted).toEqual({ transcript, stt_confidence: 0.99 });
  expect(serverSttCalls).toEqual([]);
});
