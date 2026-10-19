import { test, expect, type Page } from "@playwright/test";

type Mode =
  "ok" | "begin-error" | "begin-pending" | "capture-error" | "capture-pending";
type Probe = {
  mode: Mode;
  begins: number;
  captures: number;
  answerRecordersStarted: number;
  ends: { restoreDisplays?: boolean }[];
  tracks: MediaStreamTrack[];
  resolveBegin: () => void;
  resolveCapture: () => void;
  incident: (type: string) => void;
};
declare global {
  interface Window {
    recoveryProbe: Probe;
  }
}

async function setup(page: Page, mode: Mode = "ok") {
  await page.addInitScript((mode) => {
    let listener: ((type: string) => void) | undefined;
    const probe: Probe = {
      mode,
      begins: 0,
      captures: 0,
      answerRecordersStarted: 0,
      ends: [],
      tracks: [],
      resolveBegin: () => {},
      resolveCapture: () => {},
      incident: (type) => listener?.(type),
    };
    window.recoveryProbe = probe;
    const startRecorder = MediaRecorder.prototype.start;
    MediaRecorder.prototype.start = function (timeslice?: number) {
      if (this.stream.getAudioTracks().length) probe.answerRecordersStarted++;
      startRecorder.call(this, timeslice);
    };
    window.oralDesktop = {
      transcribe: async () => ({ transcript: "Answer", stt_confidence: 1 }),
      sttModels: async () => [
        { id: "whisper-small", label: "Whisper-small", available: true },
      ],
      beginExam: async () => {
        probe.begins++;
        if (probe.mode === "begin-error")
          throw new Error("Chỉ sử dụng một màn hình");
        if (probe.mode === "begin-pending")
          await new Promise<void>((resolve) => {
            probe.resolveBegin = resolve;
          });
      },
      endExam: async (options) => {
        probe.ends.push(options || {});
      },
      onExamEvent: (callback) => {
        listener = callback;
        return () => {
          listener = undefined;
        };
      },
    };
    const stream = () => {
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 100;
      const context = canvas.getContext("2d")!;
      context.fillRect(0, 0, 100, 100);
      const result = canvas.captureStream(5);
      probe.tracks.push(result.getVideoTracks()[0]);
      const timer = setInterval(() => {
        if (result.getVideoTracks()[0].readyState === "ended")
          clearInterval(timer);
        else context.fillRect(0, 0, 100, 100);
      }, 100);
      return result;
    };
    navigator.mediaDevices.getDisplayMedia = async () => {
      probe.captures++;
      if (probe.mode === "capture-error")
        throw new DOMException(
          "Đã từ chối chia sẻ màn hình",
          "NotAllowedError",
        );
      if (probe.mode === "capture-pending")
        return new Promise<MediaStream>((resolve) => {
          probe.resolveCapture = () => resolve(stream());
        });
      return stream();
    };
  }, mode);
  const apiState = {
    reports: "ok" as "ok" | "fail" | "pending",
    releaseReports: () => {},
    events: [] as string[],
  };
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/auth/me")
      return route.fulfill({
        json: { id: "student", name: "Student", role: "STUDENT" },
      });
    if (path === "/api/exams/available")
      return route.fulfill({
        json: [
          {
            id: "e",
            name: "Recovery exam",
            status: "ASSIGNED",
            time_limit: 600,
            question_count: 1,
          },
        ],
      });
    if (path.endsWith("/proctoring-events")) {
      apiState.events.push(route.request().postDataJSON().type);
      if (apiState.reports === "pending")
        await new Promise<void>((resolve) => {
          apiState.releaseReports = resolve;
        });
      if (apiState.reports === "fail")
        return route.fulfill({
          status: 503,
          json: { error: { message: "Giám sát mất kết nối" } },
        });
      return route.fulfill({ json: { ok: true } });
    }
    if (path === "/api/uploads/init")
      return route.fulfill({
        json: { id: "u", chunk_size: 1000000, status: "PENDING" },
      });
    if (path.endsWith("/status"))
      return route.fulfill({ json: { received_chunks: [] } });
    if (path.includes("/chunks/")) return route.fulfill({ json: { ok: true } });
    if (path.endsWith("/complete"))
      return route.fulfill({ json: { status: "COMPLETED" } });
    return route.fulfill({
      json: {
        id: "s",
        exam_id: "e",
        exam_name: "Recovery exam",
        status: "IN_PROGRESS",
        attempt_number: 1,
        time_limit: 600,
        question_count: 1,
        answered_count: 0,
        current_attempt: {
          id: "a",
          sequence: 1,
          text: "Explain recovery.",
          status: "READY",
        },
        started_at: Date.now() / 1000,
        server_time: Date.now() / 1000,
        screen_required: true,
        screen_attempt_id: "a",
        final_score: null,
      },
    });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Mở bài thi" }).click();
  await page.getByRole("button", { name: "Cho phép camera & mic" }).click();
  await expect.poll(() => apiState.events).toContain("CLIENT_RESTARTED");
  const recover = page.getByRole("button", {
    name: "Khôi phục chế độ thi",
    exact: true,
  });
  const answer = page.getByRole("button", {
    name: "Bắt đầu trả lời",
    exact: true,
  });
  await expect(recover).toBeEnabled();
  await expect(answer).toBeDisabled();
  return { apiState, recover, answer };
}

for (const mode of ["begin-error", "capture-error"] as const) {
  test(`${mode} keeps recovery usable, retains display setup and permits a secure retry`, async ({
    page,
  }) => {
    const { recover, answer } = await setup(page, mode);
    await recover.click();
    await expect(
      page.getByText(
        mode === "begin-error"
          ? "Chỉ sử dụng một màn hình"
          : "Đã từ chối chia sẻ màn hình",
        { exact: true },
      ),
    ).toBeVisible();
    await expect(recover).toBeEnabled();
    await expect(answer).toBeDisabled();
    expect(await page.evaluate(() => window.recoveryProbe.ends.at(-1))).toEqual(
      { restoreDisplays: false },
    );
    await page.evaluate(() => {
      window.recoveryProbe.mode = "ok";
    });
    await recover.click();
    await expect(recover).toHaveCount(0);
    await expect(answer).toBeEnabled();
    await expect(
      page.getByText("● Đang ghi toàn màn hình", { exact: true }),
    ).toBeVisible();
  });
}

test("cancel a pending chooser, retry, and safely dispose of the stale stream", async ({
  page,
}) => {
  const { recover, answer } = await setup(page, "capture-pending");
  await recover.click();
  await expect(
    page.getByText("Đang chờ quyền chia sẻ toàn màn hình…", { exact: true }),
  ).toBeVisible();
  await expect(recover).toBeDisabled();
  await expect(answer).toBeDisabled();
  await page
    .getByRole("button", { name: "Hủy khôi phục", exact: true })
    .click();
  await expect(recover).toBeEnabled();
  await expect(answer).toBeDisabled();
  expect(await page.evaluate(() => window.recoveryProbe.ends.at(-1))).toEqual({
    restoreDisplays: false,
  });
  await page.evaluate(() => {
    window.recoveryProbe.mode = "ok";
  });
  await recover.click();
  await expect(answer).toBeEnabled();
  await page.evaluate(() => window.recoveryProbe.resolveCapture());
  await expect
    .poll(() =>
      page.evaluate(() =>
        window.recoveryProbe.tracks.map((track) => track.readyState),
      ),
    )
    .toEqual(["live", "ended"]);
  await expect(answer).toBeEnabled();
  expect(await page.evaluate(() => window.recoveryProbe.begins)).toBe(3);
});

test("cancel a pending desktop begin without starting late screen capture", async ({
  page,
}) => {
  const { recover, answer } = await setup(page, "begin-pending");
  await recover.click();
  await expect(
    page.getByText("Đang bật chế độ thi…", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Hủy khôi phục", exact: true })
    .click();
  await expect(recover).toBeEnabled();
  await page.evaluate(() => window.recoveryProbe.resolveBegin());
  await expect(answer).toBeDisabled();
  expect(await page.evaluate(() => window.recoveryProbe.captures)).toBe(0);
  await page.evaluate(() => {
    window.recoveryProbe.mode = "ok";
  });
  await recover.click();
  await expect(answer).toBeEnabled();
});

test("native chooser blur is reported and recovery revalidates the lock", async ({
  page,
}) => {
  const { apiState, recover, answer } = await setup(page, "capture-pending");
  await recover.click();
  await expect(
    page.getByText("Đang chờ quyền chia sẻ toàn màn hình…", { exact: true }),
  ).toBeVisible();
  await page.evaluate(() => {
    window.recoveryProbe.incident("WINDOW_BLUR");
    window.recoveryProbe.resolveCapture();
  });
  await expect(answer).toBeEnabled();
  expect(apiState.events).toContain("WINDOW_BLUR");
  expect(await page.evaluate(() => window.recoveryProbe.begins)).toBe(2);
});

test("new interruption after lock revalidation never unlocks answer controls", async ({
  page,
}) => {
  const { apiState, recover, answer } = await setup(page);
  apiState.reports = "pending";
  await recover.click();
  await expect(
    page.getByText("Đang đồng bộ sự kiện giám sát…", { exact: true }),
  ).toBeVisible();
  await page.evaluate(() => window.recoveryProbe.incident("WINDOW_BLUR"));
  apiState.reports = "ok";
  apiState.releaseReports();
  await expect(
    page.getByText(
      "Chế độ thi lại bị gián đoạn. Kiểm tra màn hình rồi khôi phục lại.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(recover).toBeEnabled();
  await expect(answer).toBeDisabled();
  expect(apiState.events).toContain("WINDOW_BLUR");
  await recover.click();
  await expect(answer).toBeEnabled();
});

test("report failure leaves answering blocked and can be retried without restoring extra displays", async ({
  page,
}) => {
  const { apiState, recover, answer } = await setup(page);
  apiState.reports = "fail";
  await recover.click();
  await expect(
    page.getByText(/Giám sát mất kết nối.*HTTP 503/),
  ).toBeVisible();
  await expect(recover).toBeEnabled();
  await expect(answer).toBeDisabled();
  expect(await page.evaluate(() => window.recoveryProbe.ends.at(-1))).toEqual({
    restoreDisplays: false,
  });
  apiState.reports = "ok";
  await recover.click();
  await expect(answer).toBeEnabled();
});

test("stalled report delivery times out without leaving recovery permanently busy", async ({
  page,
}) => {
  const { apiState, recover, answer } = await setup(page);
  apiState.reports = "pending";
  await recover.click();
  await expect(
    page.getByText("Đang đồng bộ sự kiện giám sát…", { exact: true }),
  ).toBeVisible();
  await expect(answer).toBeDisabled();
  await expect(
    page.getByText(
      "Chưa gửi được sự kiện giám sát. Kiểm tra kết nối rồi thử lại.",
      { exact: true },
    ),
  ).toBeVisible({ timeout: 15000 });
  await expect(recover).toBeEnabled();
  await expect(answer).toBeDisabled();
  apiState.reports = "ok";
  apiState.releaseReports();
  await recover.click();
  await expect(answer).toBeEnabled();
});

test("an incident while answer-start is pending prevents stale recorders from starting", async ({
  page,
}) => {
  const { recover, answer } = await setup(page);
  await recover.click();
  await expect(answer).toBeEnabled();
  let started = false;
  let acknowledge: () => void = () => {};
  const pending = new Promise<void>((resolve) => {
    acknowledge = resolve;
  });
  await page.route("**/api/question-attempts/a/start", async (route) => {
    started = true;
    await pending;
    return route.fulfill({ json: { ok: true } });
  });
  await answer.click();
  await expect.poll(() => started).toBe(true);
  await page.evaluate(() => window.recoveryProbe.incident("WINDOW_BLUR"));
  acknowledge();
  await expect(
    page.getByText("Khôi phục chế độ thi và ghi màn hình trước khi trả lời.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(answer).toBeDisabled();
  expect(
    await page.evaluate(() => window.recoveryProbe.answerRecordersStarted),
  ).toBe(0);
  await expect(
    page.getByRole("button", { name: "Kết thúc trả lời", exact: true }),
  ).toHaveCount(0);
});
