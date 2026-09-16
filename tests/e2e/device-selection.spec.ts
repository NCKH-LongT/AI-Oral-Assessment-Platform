import { test, expect } from "@playwright/test";

test("select mic/camera, reset preflight and handle disconnect without switching devices silently", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const state = window as unknown as {
      captures: { constraints: MediaStreamConstraints; stream: MediaStream }[];
      missingCamera: boolean;
    };
    state.captures = [];
    state.missingCamera = false;
    let granted = false;
    let denyOnce = true;
    navigator.mediaDevices.enumerateDevices = async () =>
      [
        ["audioinput", "mic-1", "Microphone tích hợp"],
        ["audioinput", "mic-2", "Microphone USB"],
        ["videoinput", "cam-1", "Camera tích hợp"],
        ...(!state.missingCamera
          ? [["videoinput", "cam-2", "Camera USB"]]
          : []),
      ].map(
        ([kind, deviceId, label]) =>
          ({
            kind,
            deviceId,
            label: granted ? label : "",
            groupId: "test",
            toJSON: () => ({}),
          }) as MediaDeviceInfo,
      );
    const original = navigator.mediaDevices.getUserMedia.bind(
      navigator.mediaDevices,
    );
    navigator.mediaDevices.getUserMedia = async (constraints) => {
      if (denyOnce) {
        denyOnce = false;
        throw new DOMException("Permission denied", "NotAllowedError");
      }
      const mic =
        typeof constraints?.audio === "object"
          ? (constraints.audio.deviceId as { exact?: string })?.exact || "mic-1"
          : "mic-1";
      const camera =
        typeof constraints?.video === "object"
          ? (constraints.video.deviceId as { exact?: string })?.exact || "cam-1"
          : "cam-1";
      if (state.missingCamera && camera === "cam-2")
        throw new DOMException("Missing camera", "OverconstrainedError");
      const mapped = structuredClone(constraints!);
      if (typeof mapped.audio === "object") delete mapped.audio.deviceId;
      if (typeof mapped.video === "object") delete mapped.video.deviceId;
      const stream = await original(mapped);
      granted = true;
      for (const track of stream.getTracks()) {
        const settings = track.getSettings.bind(track);
        track.getSettings = () => ({
          ...settings(),
          deviceId: track.kind === "audio" ? mic : camera,
        });
      }
      state.captures.push({ constraints: constraints!, stream });
      return stream;
    };
    AnalyserNode.prototype.getFloatTimeDomainData = (samples) =>
      samples.fill(0.001);
  });
  await page.route("**/api/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    return route.fulfill({
      json: path.endsWith("/auth/me")
        ? { id: "student", role: "STUDENT", name: "Device test" }
        : path.endsWith("/exams/available")
          ? [
              {
                id: "exam",
                name: "Device exam",
                status: "ASSIGNED",
                time_limit: 600,
                question_count: 1,
              },
            ]
          : {
              id: "session",
              exam_name: "Device exam",
              status: "DEVICE_CHECK",
              time_limit: 600,
              question_count: 1,
              started_at: null,
              server_time: Date.now() / 1000,
              final_score: null,
              answered_count: 0,
              current_attempt: null,
            },
    });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Mở bài thi" }).click();
  const mic = page.getByRole("combobox", { name: "Microphone", exact: true });
  const camera = page.getByRole("combobox", { name: "Camera", exact: true });
  await expect(mic).toBeVisible();
  await page.getByRole("button", { name: "Cho phép camera & mic" }).click();
  await expect(page.locator(".device-panel [role=alert]")).toContainText(
    "Chưa được cấp quyền camera/mic",
  );
  await page.getByRole("button", { name: "Cho phép camera & mic" }).click();
  await expect(mic).toHaveValue("mic-1");
  await expect(
    mic.locator("option", { hasText: "Microphone USB" }),
  ).toHaveCount(1);
  await page
    .getByRole("button", { name: "Bỏ qua kiểm tra độ ồn", exact: true })
    .click();
  const start = page.getByRole("button", { name: "Bắt đầu thi", exact: true });
  await expect(start).toBeEnabled();
  await mic.selectOption("mic-2");
  await expect(
    page.getByRole("button", { name: "Kết nối lại thiết bị" }),
  ).toBeEnabled();
  await expect(start).toBeDisabled();
  await camera.selectOption("cam-2");
  await expect(
    page.getByRole("button", { name: "Kết nối lại thiết bị" }),
  ).toBeEnabled();
  const capture = await page.evaluate(() => {
    const { captures } = window as unknown as {
      captures: { stream: MediaStream; constraints: MediaStreamConstraints }[];
    };
    return {
      constraints: captures.at(-1)!.constraints,
      oldStopped: captures
        .slice(0, -1)
        .every((c) =>
          c.stream.getTracks().every((t) => t.readyState === "ended"),
        ),
    };
  });
  expect(capture.constraints.audio).toMatchObject({
    deviceId: { exact: "mic-2" },
    noiseSuppression: false,
  });
  expect(capture.constraints.video).toMatchObject({
    deviceId: { exact: "cam-2" },
  });
  expect(capture.oldStopped).toBe(true);
  await page
    .getByRole("button", { name: "Kiểm tra độ ồn", exact: true })
    .click();
  await expect(
    page.getByText("Môi trường đủ yên lặng. Bạn có thể bắt đầu thi."),
  ).toBeVisible({ timeout: 20000 });
  expect(
    await page.evaluate(
      () =>
        (
          window as unknown as {
            captures: { constraints: MediaStreamConstraints }[];
          }
        ).captures.at(-1)!.constraints,
    ),
  ).toMatchObject({ video: false, audio: { deviceId: { exact: "mic-2" } } });
  await expect(start).toBeEnabled();
  await page.evaluate(() => {
    const state = window as unknown as {
      missingCamera: boolean;
      captures: { stream: MediaStream }[];
    };
    state.missingCamera = true;
    const track = state.captures
      .findLast((c) => c.stream.getVideoTracks().length)!
      .stream.getVideoTracks()[0];
    track.stop();
    track.dispatchEvent(new Event("ended"));
    navigator.mediaDevices.dispatchEvent(new Event("devicechange"));
  });
  await expect(page.locator(".device-panel [role=alert]")).toContainText(
    "Thiết bị đã ngắt kết nối",
  );
  await expect(start).toBeDisabled();
  await expect(camera.locator("option", { hasText: "Camera USB" })).toHaveCount(
    0,
  );
  await page.getByRole("button", { name: "Kết nối lại thiết bị" }).click();
  await expect(page.locator(".device-panel [role=alert]")).toContainText(
    "Thiết bị đã chọn không còn khả dụng",
  );
  await expect(camera).toHaveValue("cam-2");
  await camera.selectOption("cam-1");
  await expect(
    page.getByRole("button", { name: "Kết nối lại thiết bị" }),
  ).toBeEnabled();
  await expect(page.locator(".device-panel [role=alert]")).toHaveCount(0);
  await expect(start).toBeDisabled();
});
