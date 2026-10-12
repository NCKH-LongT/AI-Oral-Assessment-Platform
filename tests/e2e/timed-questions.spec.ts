import { test, expect } from "@playwright/test";

for (const uploadFails of [false, true]) {
  test(`timed questions auto record, advance early, stop at limit and preserve failed uploads: ${uploadFails}`, async ({
    page,
  }) => {
    await page.addInitScript(() => {
      window.oralDesktop = {
        transcribe: async () => {
          throw new Error("No desktop STT");
        },
      };
    });
    const questions = [
      {
        id: "a1",
        sequence: 1,
        text: "First timed question",
        status: "READY",
        preparation_seconds: 1,
        recording_seconds: 10,
      },
      {
        id: "a2",
        sequence: 2,
        text: "Second timed question",
        status: "READY",
        preparation_seconds: 1,
        recording_seconds: 2,
      },
    ];
    const clocks = new Map<
      string,
      { ready_at: number; recording_deadline: number | null }
    >();
    const submissions: string[] = [];
    const recordings: string[] = [];
    let finishes = 0;
    let failUpload = uploadFails;
    const uploaded: string[] = [];
    const session = {
      id: "s",
      exam_name: "Timed exam",
      server_processing: true,
      timed_questions: true,
      status: "DEVICE_CHECK",
      time_limit: 600,
      question_count: 2,
      answered_count: 0,
      started_at: null as number | null,
      server_time: Date.now() / 1000,
      current_attempt: null as (typeof questions)[number] | null,
    };
    await page.route("**/api/**", (route) => {
      const path = new URL(route.request().url()).pathname;
      const now = Date.now() / 1000;
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
              status: "ASSIGNED",
              time_limit: 600,
              question_count: 2,
            },
            {
              id: "practice",
              name: "Removed practice",
              practice: true,
              status: "ASSIGNED",
              time_limit: 600,
              question_count: 1,
            },
          ],
        });
      if (path === "/api/exam-sessions/s/start") {
        session.status = "IN_PROGRESS";
        session.started_at = now;
        session.current_attempt = questions[0];
      }
      if (path.endsWith("/prepare")) {
        const id = path.split("/").at(-2)!;
        if (!clocks.has(id))
          clocks.set(id, { ready_at: now + 1, recording_deadline: null });
        return route.fulfill({ json: { ...clocks.get(id), server_time: now } });
      }
      if (
        path.startsWith("/api/question-attempts/") &&
        path.endsWith("/start")
      ) {
        const id = path.split("/").at(-2)!;
        const clock = clocks.get(id)!;
        expect(now).toBeGreaterThanOrEqual(clock.ready_at);
        clock.recording_deadline =
          now + questions.find((q) => q.id === id)!.recording_seconds;
        recordings.push(id);
        return route.fulfill({ json: { ...clock, server_time: now } });
      }
      if (path.endsWith("/submit")) {
        const id = path.split("/").at(-2)!;
        expect(route.request().postDataJSON().processing_mode).toBe(
          "server_audio",
        );
        submissions.push(id);
        session.answered_count++;
        session.current_attempt = questions[session.answered_count] || null;
        return route.fulfill({ json: { status: "SUBMITTED" } });
      }
      if (path === "/api/uploads/init") {
        const body = route.request().postDataJSON();
        expect(body.size).toBeGreaterThan(0);
        if (body.attempt_id === "a2" && failUpload)
          return route.fulfill({
            status: 503,
            json: { error: { message: "Storage unavailable" } },
          });
        uploaded.push(body.attempt_id);
        return route.fulfill({
          json: {
            id: String(uploaded.length),
            status: "COMPLETED",
            chunk_size: 4194304,
          },
        });
      }
      if (path === "/api/exam-sessions/s/finish") {
        expect(uploaded).toEqual(["a1", "a1", "a2", "a2"]);
        finishes++;
        session.status = "SUBMITTED";
      }
      return route.fulfill({ json: { ...session, server_time: now } });
    });
    await page.goto("/");
    await expect(page.getByText("Removed practice")).toHaveCount(0);
    await page.getByRole("button", { name: "Mở bài thi" }).click();
    await page.getByRole("button", { name: "Cho phép camera & mic" }).click();
    await page
      .getByRole("button", { name: "Bắt đầu thi", exact: true })
      .click();
    await expect(page.getByText(/Chuẩn bị:.*giây/)).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Bắt đầu trả lời", exact: true }),
    ).toHaveCount(0);
    await expect(page.getByText(/Đang ghi âm và ghi hình/)).toBeVisible();
    await page.waitForTimeout(1100); // Capture nonempty original WebM evidence.
    await page
      .getByRole("button", { name: "Kết thúc trả lời", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Second timed question" }),
    ).toBeVisible();
    await expect.poll(() => submissions.length).toBe(2);
    expect(recordings).toEqual(["a1", "a2"]);
    if (uploadFails) {
      await expect(
        page.getByRole("button", { name: "Tải lại", exact: true }),
      ).toHaveCount(2);
      expect(finishes).toBe(0);
      await expect(
        page.getByRole("button", { name: "Nộp bài thi", exact: true }),
      ).toBeDisabled();
      failUpload = false;
      await page
        .getByRole("button", { name: "Tải lại", exact: true })
        .first()
        .click();
      await expect(
        page.getByRole("button", { name: "Tải lại", exact: true }),
      ).toHaveCount(1);
      await page
        .getByRole("button", { name: "Tải lại", exact: true })
        .first()
        .click();
      await page
        .getByRole("button", { name: "Nộp bài thi", exact: true })
        .click();
    }
    await expect(page.locator(".finished")).toContainText("Đã nộp bài thi");
    expect(finishes).toBe(1);
  });
}
