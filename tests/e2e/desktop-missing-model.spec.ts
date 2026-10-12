import { test, expect } from "@playwright/test";
import { expectNoDesktopAudioControls } from "./helpers/desktop-audio";

for (const mode of ["missing", "disappears", "installed-later"] as const) {
  test(`desktop keeps original evidence and continues when model is ${mode}`, async ({
    page,
  }) => {
    await page.addInitScript((mode) => {
      const probe = { available: mode === "disappears", transcriptions: 0 };
      (window as unknown as { sttProbe: typeof probe }).sttProbe = probe;
      window.oralDesktop = {
        sttModels: async () => [
          {
            id: "whisper-small",
            label: "Whisper-small",
            available: probe.available,
          },
        ],
        transcribe: async (audio) => {
          if (!audio.byteLength) throw new Error("Expected original recording");
          probe.transcriptions++;
          return mode === "disappears"
            ? {
                transcript: "",
                stt_confidence: null,
                stt_skipped_reason: "MODEL_MISSING",
              }
            : { transcript: "A real local transcript", stt_confidence: 0.9 };
        },
      };
    }, mode);
    const submissions: unknown[] = [];
    const uploads: { kind: string; size: number; sha256: string }[] = [];
    let serverSttCalls = 0;
    let configCalls = 0;
    const session = {
      id: "s",
      exam_name: "Missing model exam",
      status: "DEVICE_CHECK",
      time_limit: 600,
      question_count: 1,
      answered_count: 0,
      started_at: null as number | null,
      server_time: Date.now() / 1000,
      final_score: null,
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
              id: "e",
              name: session.exam_name,
              time_limit: 600,
              question_count: 1,
              status: "ASSIGNED",
            },
          ],
        });
      if (path === "/api/stt/config") {
        configCalls++;
        return route.fulfill({
          json: {
            provider: "local",
            preprocessing: "off",
            language: "vi",
            hotwords: [],
          },
        });
      }
      if (path === "/api/stt") {
        serverSttCalls++;
        return route.fulfill({ status: 503, json: {} });
      }
      if (path === "/api/exam-sessions/s/start") {
        session.status = "IN_PROGRESS";
        session.started_at = Date.now() / 1000;
        session.current_attempt = {
          id: "a",
          sequence: 1,
          text: "Explain testing.",
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
      if (path === "/api/exam-sessions/s/finish")
        session.status = "REVIEW_REQUIRED";
      return route.fulfill({ json: session });
    });
    await page.goto("/");
    await page.getByRole("button", { name: "Mở bài thi" }).click();
    await page.getByRole("button", { name: "Cho phép camera & mic" }).click();
    await expectNoDesktopAudioControls(page);
    await page
      .getByRole("button", { name: "Bắt đầu thi", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Bắt đầu trả lời", exact: true })
      .click();
    await page.waitForTimeout(1200);
    await page
      .getByRole("button", { name: "Kết thúc trả lời", exact: true })
      .click();
    await expect(page.getByText(/Đã bỏ qua STT vì thiếu model/)).toBeVisible();
    const submit = page.getByRole("button", {
      name: "Nộp câu trả lời & tiếp tục",
    });
    const retry = page.getByRole("button", {
      name: "Thử STT lại",
      exact: true,
    });
    await expect(submit).toBeEnabled();
    await retry.click();
    await expect(submit).toBeEnabled();
    if (mode !== "disappears") expect(configCalls).toBe(0);
    if (mode === "installed-later") {
      await page.evaluate(() => {
        (
          window as unknown as { sttProbe: { available: boolean } }
        ).sttProbe.available = true;
      });
      await retry.click();
      await expect(
        page.getByText("Câu trả lời đã sẵn sàng để nộp.", { exact: true }),
      ).toBeVisible();
      // Missing model on a later retry retains the successful result.
      await page.evaluate(() => {
        (
          window as unknown as { sttProbe: { available: boolean } }
        ).sttProbe.available = false;
      });
      await retry.click();
      await expect(
        page.getByText("Câu trả lời đã sẵn sàng để nộp.", { exact: true }),
      ).toBeVisible();
    }
    await submit.click();
    await expect.poll(() => uploads.length).toBe(2);
    expect(uploads.map((upload) => upload.kind).sort()).toEqual([
      "AUDIO",
      "VIDEO",
    ]);
    for (const upload of uploads) {
      expect(upload.size).toBeGreaterThan(0);
      expect(upload.sha256).toMatch(/^[a-f0-9]{64}$/);
    }
    expect(submissions).toEqual([
      mode === "installed-later"
        ? { transcript: "A real local transcript", stt_confidence: 0.9 }
        : {
            transcript: "",
            stt_confidence: null,
            stt_skipped_reason: "MODEL_MISSING",
          },
    ]);
    await page
      .getByRole("button", { name: "Nộp bài thi", exact: true })
      .click();
    await expect(page.locator(".finished")).toContainText(
      "Đã nộp bài thi",
    );
    await expect(page.locator(".finished")).not.toContainText("0/10");
    expect(serverSttCalls).toBe(0);
    if (mode === "missing") {
      const calls = await page.evaluate(
        () =>
          (window as unknown as { sttProbe: { transcriptions: number } })
            .sttProbe.transcriptions,
      );
      expect(calls).toBe(0);
    }
  });
}
