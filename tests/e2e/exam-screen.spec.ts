import { test, expect } from "@playwright/test";

test("mandatory screen capture survives interruption and uploads before finishing", async ({
  page,
}) => {
  await page.addInitScript(() => {
    let eventListener: ((type: string) => void) | undefined;
    const probe = {
      begin: 0,
      end: 0,
      captures: 0,
      interrupt: () => eventListener?.("WINDOW_BLUR"),
    };
    (window as unknown as { screenProbe: typeof probe }).screenProbe = probe;
    window.oralDesktop = {
      transcribe: async () => ({ transcript: "Answer", stt_confidence: 1 }),
      beginExam: async () => {
        probe.begin++;
      },
      endExam: async () => {
        probe.end++;
      },
      onExamEvent: (listener) => {
        eventListener = listener;
        return () => {
          eventListener = undefined;
        };
      },
    };
    navigator.mediaDevices.getDisplayMedia = async () => {
      probe.captures++;
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 100;
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "blue";
      ctx.fillRect(0, 0, 100, 100);
      const stream = canvas.captureStream(5);
      const timer = setInterval(() => ctx.fillRect(0, 0, 100, 100), 100);
      stream
        .getVideoTracks()[0]
        .addEventListener("ended", () => clearInterval(timer));
      return stream;
    };
  });
  const events: string[] = [];
  const order: string[] = [];
  let failedUpload = false;
  const session = {
    id: "s",
    exam_id: "e",
    exam_name: "Screen exam",
    status: "DEVICE_CHECK",
    attempt_number: 1,
    time_limit: 600,
    question_count: 1,
    answered_count: 0,
    current_attempt: null,
    started_at: null as number | null,
    server_time: Date.now() / 1000,
    screen_required: true,
    screen_attempt_id: "a",
    final_score: null,
  };
  await page.route("**/api/**", async (r) => {
    const path = new URL(r.request().url()).pathname;
    if (path === "/api/auth/me")
      return r.fulfill({
        json: { id: "student", name: "Student", role: "STUDENT" },
      });
    if (path === "/api/exams/available")
      return r.fulfill({
        json: [
          {
            id: "e",
            name: "Screen exam",
            time_limit: 600,
            question_count: 1,
            history: [],
            status: "ASSIGNED",
            can_start_new: true,
          },
        ],
      });
    if (path.endsWith("/proctoring-events")) {
      events.push(r.request().postDataJSON().type);
      return r.fulfill({ json: { ok: true } });
    }
    if (path.endsWith("/start")) {
      expect(r.request().postDataJSON()).toEqual({ screen_consent: true });
      session.status = "IN_PROGRESS";
      session.started_at = Date.now() / 1000;
      order.push("start");
    }
    if (path === "/api/uploads/init") {
      const body = r.request().postDataJSON();
      expect(body.kind).toBe("SCREEN");
      expect(body.size).toBeGreaterThan(0);
      if (!failedUpload) {
        failedUpload = true;
        return r.fulfill({
          status: 503,
          json: { error: { message: "Mạng tạm lỗi" } },
        });
      }
      order.push("screen-init");
      return r.fulfill({
        json: { id: "u", chunk_size: 1000000, status: "PENDING" },
      });
    }
    if (path.endsWith("/status"))
      return r.fulfill({ json: { received_chunks: [] } });
    if (path.includes("/chunks/")) return r.fulfill({ json: { ok: true } });
    if (path.endsWith("/complete")) {
      order.push("screen-complete");
      return r.fulfill({ json: { status: "COMPLETED" } });
    }
    if (path.endsWith("/finish")) {
      expect(order).toContain("screen-complete");
      order.push("finish");
      session.status = "REVIEW_REQUIRED";
    }
    return r.fulfill({ json: session });
  });
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Môn học & đề thi", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Mở bài thi →", exact: true }).click();
  await page.getByRole("button", { name: "Cho phép camera & mic" }).click();
  const start = page.getByRole("button", { name: "Bắt đầu thi", exact: true });
  await expect(start).toBeDisabled();
  await page
    .getByRole("checkbox", { name: /Tôi đồng ý ghi toàn màn hình/ })
    .check();
  await start.click();
  await expect(
    page.getByText("● Đang ghi toàn màn hình", { exact: true }),
  ).toBeVisible();
  await page.evaluate(() =>
    (
      window as unknown as { screenProbe: { interrupt: () => void } }
    ).screenProbe.interrupt(),
  );
  await expect(
    page.getByRole("button", { name: "Khôi phục chế độ thi" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Khôi phục chế độ thi" }).click();
  await expect.poll(() => events).toContain("WINDOW_BLUR");
  await expect.poll(() => events).toContain("SCREEN_RESUMED");
  // Record enough real canvas frames for a nonempty, independently encoded file.
  await page.waitForTimeout(1200);
  await page.getByRole("button", { name: "Nộp bài thi", exact: true }).click();
  await expect(page.getByText("Mạng tạm lỗi", { exact: true })).toBeVisible();
  expect(order).not.toContain("finish");
  await page.getByRole("button", { name: "Tải lại", exact: true }).click();
  await expect.poll(() => order).toContain("screen-complete");
  await page.getByRole("button", { name: "Nộp bài thi", exact: true }).click();
  await expect.poll(() => order).toContain("finish");
  expect(order.indexOf("screen-complete")).toBeLessThan(
    order.indexOf("finish"),
  );
});
