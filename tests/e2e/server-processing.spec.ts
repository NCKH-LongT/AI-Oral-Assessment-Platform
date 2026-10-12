import { test, expect } from "@playwright/test";

test("student submits recordings and receives a receipt without polling grading", async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.oralDesktop = {
      sttModels: async () => [
        { id: "whisper-small", label: "Whisper-small", available: false },
      ],
      transcribe: async () => {
        throw new Error("Local STT must not be called");
      },
    };
  });
  const submissions: unknown[] = [];
  const uploads: { kind: string; size: number }[] = [];
  let sttCalls = 0;
  let finishedReads = 0;
  const session = {
    id: "s",
    server_processing: true,
    exam_name: "Queued English exam",
    status: "DEVICE_CHECK",
    time_limit: 600,
    question_count: 1,
    answered_count: 0,
    started_at: null as number | null,
    server_time: Date.now() / 1000,
    final_score: null,
    processing: null as null | {
      status: string;
      total: number;
      transcribed: number;
      completed: number;
      failed: number;
    },
    current_attempt: null as null | {
      id: string;
      sequence: number;
      text: string;
      status: string;
    },
  };
  await page.route("**/api/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/exam-sessions/s" && session.status === "SUBMITTED")
      finishedReads++;
    if (path === "/api/auth/me")
      return route.fulfill({
        json: { id: "student", role: "STUDENT", name: "Student" },
      });
    if (path === "/api/exams/available")
      return route.fulfill({
        json: [
          {
            id: "e",
            name: session.exam_name,
            time_limit: 600,
            question_count: 1,
            status: "ASSIGNED",
          },
        ],
      });
    if (path.startsWith("/api/stt")) {
      sttCalls++;
      return route.fulfill({ status: 500 });
    }
    if (path === "/api/exam-sessions/s/start") {
      session.status = "IN_PROGRESS";
      session.started_at = Date.now() / 1000;
      session.current_attempt = {
        id: "a",
        sequence: 1,
        text: "Introduce yourself.",
        status: "READY",
      };
    }
    if (path === "/api/question-attempts/a/submit") {
      submissions.push(route.request().postDataJSON());
      session.current_attempt = null;
      session.answered_count = 1;
      return route.fulfill({ json: { status: "SUBMITTED" } });
    }
    if (path === "/api/uploads/init") {
      uploads.push(route.request().postDataJSON());
      return route.fulfill({
        json: {
          id: String(uploads.length),
          chunk_size: 4194304,
          status: "COMPLETED",
        },
      });
    }
    if (path === "/api/exam-sessions/s/finish") {
      session.status = "SUBMITTED";
      session.processing = {
        status: "QUEUED_STT",
        total: 1,
        transcribed: 0,
        completed: 0,
        failed: 0,
      };
    }
    return route.fulfill({ json: session });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Mở bài thi" }).click();
  await expect(
    page.getByText("Nhận dạng giọng nói trên desktop", { exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Cho phép camera & mic" }).click();
  await page.getByRole("button", { name: "Bắt đầu thi", exact: true }).click();
  await page
    .getByRole("button", { name: "Bắt đầu trả lời", exact: true })
    .click();
  await page.waitForTimeout(1200);
  await page
    .getByRole("button", { name: "Kết thúc trả lời", exact: true })
    .click();
  await expect(page.getByRole("button", { name: "Thử STT lại" })).toHaveCount(
    0,
  );
  await page
    .getByRole("button", { name: "Nộp câu trả lời & tiếp tục" })
    .click();
  await expect.poll(() => uploads.length).toBe(2);
  expect(uploads.every((u) => u.size > 0)).toBe(true);
  expect(submissions).toEqual([
    { transcript: "", stt_confidence: null, processing_mode: "server_audio" },
  ]);
  await page.getByRole("button", { name: "Nộp bài thi", exact: true }).click();
  await expect(page.locator(".finished")).toContainText("Đã nộp bài thi");
  await expect(page.locator(".finished")).toContainText(
    "Bạn có thể đóng ứng dụng",
  );
  await expect(page.locator(".finished")).not.toContainText("Chờ nhận dạng");
  const reads = finishedReads;
  await page.waitForTimeout(4500); // Cross the former grading poll interval.
  expect(finishedReads).toBe(reads);
  expect(sttCalls).toBe(0);
});
