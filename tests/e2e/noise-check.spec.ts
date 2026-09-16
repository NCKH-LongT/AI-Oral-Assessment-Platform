import { test, expect, type Page } from "@playwright/test";

async function preflight(page: Page, amplitude: number) {
  await page.addInitScript((amplitude) => {
    const state = window as unknown as {
      noiseAmplitude: number;
      noiseTracks: MediaStreamTrack[];
      recordingStarts: number;
    };
    state.noiseAmplitude = amplitude;
    state.noiseTracks = [];
    state.recordingStarts = 0;
    AnalyserNode.prototype.getFloatTimeDomainData = function (samples) {
      for (let i = 0; i < samples.length; i++)
        samples[i] = i % 2 ? state.noiseAmplitude : -state.noiseAmplitude;
    };
    const getUserMedia = navigator.mediaDevices.getUserMedia.bind(
      navigator.mediaDevices,
    );
    navigator.mediaDevices.getUserMedia = async (constraints) => {
      const stream = await getUserMedia(constraints);
      if (constraints?.video === false)
        state.noiseTracks.push(...stream.getTracks());
      return stream;
    };
    const start = MediaRecorder.prototype.start;
    MediaRecorder.prototype.start = function (timeslice) {
      state.recordingStarts++;
      start.call(this, timeslice);
    };
  }, amplitude);
  await page.route("**/api/auth/me", (r) =>
    r.fulfill({
      json: {
        id: "student",
        name: "Noise test",
        username: "noise",
        role: "STUDENT",
      },
    }),
  );
  await page.route("**/api/exams/available", (r) =>
    r.fulfill({
      json: [
        {
          id: "noise-exam",
          name: "Noise exam",
          time_limit: 600,
          question_count: 1,
          status: "ASSIGNED",
        },
      ],
    }),
  );
  await page.route("**/api/exam-sessions", (r) =>
    r.fulfill({
      json: {
        id: "noise-session",
        exam_name: "Noise exam",
        status: "DEVICE_CHECK",
        started_at: null,
        time_limit: 600,
        server_time: Date.now() / 1000,
        final_score: null,
        question_count: 1,
        answered_count: 0,
        current_attempt: null,
      },
    }),
  );
  await page.goto("/");
  await page.getByRole("button", { name: "Mở bài thi" }).click();
  await expect(
    page.getByRole("button", { name: "Bắt đầu thi", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Cho phép camera & mic" }).click();
  await expect(
    page.getByRole("button", { name: "Kiểm tra độ ồn", exact: true }),
  ).toBeVisible();
}

async function expectReleased(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(() =>
        (
          window as unknown as { noiseTracks: MediaStreamTrack[] }
        ).noiseTracks.every((t) => t.readyState === "ended"),
      ),
    )
    .toBe(true);
  expect(
    await page
      .locator("video")
      .evaluate((v: HTMLVideoElement) =>
        (v.srcObject as MediaStream)
          .getTracks()
          .every((t) => t.readyState === "live"),
      ),
  ).toBe(true);
}

test("quiet room passes; ten-second raw and RNNoise recordings can be played locally", async ({
  page,
}) => {
  await preflight(page, 0.001);
  await page
    .getByRole("button", { name: "Kiểm tra độ ồn", exact: true })
    .click();
  await expect(
    page.getByText("Môi trường đủ yên lặng. Bạn có thể bắt đầu thi."),
  ).toBeVisible({ timeout: 20000 });
  await expect(
    page.getByRole("button", { name: "Bắt đầu thi", exact: true }),
  ).toBeEnabled();
  await expectReleased(page);
  const player = page.getByLabel("Phát lại kiểm tra mic");
  await expect(player).toBeVisible();
  const rawUrl = await player.getAttribute("src");
  await player.evaluate(async (audio: HTMLAudioElement) => {
    await audio.play();
  });
  await expect
    .poll(() => player.evaluate((audio: HTMLAudioElement) => audio.currentTime))
    .toBeGreaterThan(0);
  await page
    .getByRole("checkbox", { name: "Nghe bản đã lọc nhiễu RNNoise" })
    .check();
  await expect(player).not.toHaveAttribute("src", rawUrl!);
  await player.evaluate(async (audio: HTMLAudioElement) => {
    await audio.play();
  });
  await expect
    .poll(() => player.evaluate((audio: HTMLAudioElement) => audio.currentTime))
    .toBeGreaterThan(0);
});

test("noisy room blocks start; moving to a quiet room and retrying passes", async ({
  page,
}) => {
  await preflight(page, 0.1);
  await page
    .getByRole("button", { name: "Kiểm tra độ ồn", exact: true })
    .click();
  await expect(page.getByText(/Môi trường quá ồn/)).toBeVisible({
    timeout: 20000,
  });
  await expect(
    page.getByRole("button", { name: "Bắt đầu thi", exact: true }),
  ).toBeDisabled();
  await page.evaluate(() => {
    (window as unknown as { noiseAmplitude: number }).noiseAmplitude = 0.001;
  });
  await page.getByRole("button", { name: "Kiểm tra lại độ ồn" }).click();
  await expect(page.getByText(/Môi trường đủ yên lặng/)).toBeVisible({
    timeout: 20000,
  });
  await expect(
    page.getByRole("button", { name: "Bắt đầu thi", exact: true }),
  ).toBeEnabled();
  await expectReleased(page);
});

test("skip cancels an active check and a late result cannot undo the skip", async ({
  page,
}) => {
  await preflight(page, 0.1);
  await page
    .getByRole("button", { name: "Kiểm tra độ ồn", exact: true })
    .click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as { noiseTracks: MediaStreamTrack[] }).noiseTracks
            .length,
      ),
    )
    .toBe(1);
  await page.getByRole("button", { name: "Bỏ qua kiểm tra độ ồn" }).click();
  await expect(page.getByText(/Bạn đã bỏ qua kiểm tra độ ồn/)).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Bắt đầu thi", exact: true }),
  ).toBeEnabled();
  await expectReleased(page);
});

test("muted or zero signal does not pass as a quiet room; user can skip", async ({
  page,
}) => {
  await preflight(page, 0);
  await page
    .getByRole("button", { name: "Kiểm tra độ ồn", exact: true })
    .click();
  await expect(
    page.getByText(/Không nhận được tín hiệu microphone/),
  ).toBeVisible({ timeout: 20000 });
  await expect(
    page.getByRole("button", { name: "Bắt đầu thi", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Bỏ qua kiểm tra độ ồn" }).click();
  await expect(
    page.getByRole("button", { name: "Bắt đầu thi", exact: true }),
  ).toBeEnabled();
  await expectReleased(page);
});
