import { test, expect } from "@playwright/test";
import type { ExamSession } from "../../apps/admin-web/components/api";
import {
  expectNoDesktopAudioControls,
  expectNoDesktopAudioProcessing,
  observeDesktopAudio,
  type DesktopAudioProbe,
} from "./helpers/desktop-audio";

test("desktop keeps permission and disconnect gates and reconnects without an audio test", async ({
  page,
}) => {
  const audioAssetRequests = await observeDesktopAudio(page);
  await page.addInitScript(() => {
    window.oralDesktop = {
      sttModels: async () => [
        {
          id: "phowhisper-small",
          label: "PhoWhisper-small",
          available: true,
        },
      ],
      transcribe: async () => ({
        transcript: "The recording survives a disconnected microphone.",
        stt_confidence: 0.9,
      }),
    };
    const state = window as unknown as {
      deviceCaptures: {
        constraints: MediaStreamConstraints;
        stream: MediaStream;
      }[];
      missingCamera: boolean;
      missingMicrophone: boolean;
    };
    state.deviceCaptures = [];
    state.missingCamera = false;
    state.missingMicrophone = false;
    let granted = false;
    let denyOnce = true;
    navigator.mediaDevices.enumerateDevices = async () =>
      [
        ["audioinput", "mic-1", "Microphone tích hợp"],
        ...(!state.missingMicrophone
          ? [["audioinput", "mic-2", "Microphone USB"]]
          : []),
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
      const microphone =
        typeof constraints?.audio === "object"
          ? (constraints.audio.deviceId as { exact?: string })?.exact || "mic-1"
          : "mic-1";
      const camera =
        typeof constraints?.video === "object"
          ? (constraints.video.deviceId as { exact?: string })?.exact || "cam-1"
          : "cam-1";
      if (
        (state.missingCamera && camera === "cam-2") ||
        (state.missingMicrophone && microphone === "mic-2")
      )
        throw new DOMException("Missing device", "OverconstrainedError");
      const mapped = structuredClone(constraints!);
      if (typeof mapped.audio === "object") delete mapped.audio.deviceId;
      if (typeof mapped.video === "object") delete mapped.video.deviceId;
      const stream = await original(mapped);
      granted = true;
      for (const track of stream.getTracks()) {
        const settings = track.getSettings.bind(track);
        track.getSettings = () => ({
          ...settings(),
          deviceId: track.kind === "audio" ? microphone : camera,
        });
      }
      state.deviceCaptures.push({ constraints: constraints!, stream });
      return stream;
    };
  });
  const session: ExamSession = {
    id: "session",
    attempt_number: 1,
    exam_name: "Desktop devices",
    practice: false,
    status: "DEVICE_CHECK",
    time_limit: 600,
    question_count: 1,
    started_at: null,
    server_time: Date.now() / 1000,
    final_score: null,
    grading_message: null,
    answered_count: 0,
    current_attempt: null,
  };
  await page.route("**/api/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/auth/me"))
      return route.fulfill({
        json: { id: "student", role: "STUDENT", name: "Device test" },
      });
    if (path.endsWith("/exams/available"))
      return route.fulfill({
        json: [
          {
            id: "exam",
            name: session.exam_name,
            status: "ASSIGNED",
            time_limit: 600,
            question_count: 1,
          },
        ],
      });
    if (path.endsWith("/session/start")) {
      session.status = "IN_PROGRESS";
      session.started_at = Date.now() / 1000;
      session.current_attempt = {
        id: "attempt",
        sequence: 1,
        text: "Explain device reconnection.",
        status: "READY",
      };
    }
    if (path.endsWith("/stt/config"))
      return route.fulfill({
        json: { provider: "google", language: "vi", preprocessing: "denoise" },
      });
    return route.fulfill({ json: session });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Mở bài thi" }).click();
  const mic = page.getByRole("combobox", { name: "Microphone", exact: true });
  const camera = page.getByRole("combobox", { name: "Camera", exact: true });
  const startExam = page.getByRole("button", {
    name: "Bắt đầu thi",
    exact: true,
  });
  const deviceError = page.locator(".device-panel [role=alert]");
  await expect(startExam).toBeDisabled();
  await expectNoDesktopAudioControls(page);
  await page.getByRole("button", { name: "Cho phép camera & mic" }).click();
  await expect(deviceError).toContainText("Chưa được cấp quyền camera/mic");
  await expect(startExam).toBeDisabled();
  await page.getByRole("button", { name: "Cho phép camera & mic" }).click();
  await expect(mic).toHaveValue("mic-1");
  await expect(startExam).toBeEnabled();
  await expect(
    mic.locator("option", { hasText: "Microphone USB" }),
  ).toHaveCount(1);
  await mic.selectOption("mic-2");
  await expect(startExam).toBeEnabled();
  await camera.selectOption("cam-2");
  await expect(startExam).toBeEnabled();
  const capture = await page.evaluate(() => {
    const { deviceCaptures } = window as unknown as {
      deviceCaptures: {
        stream: MediaStream;
        constraints: MediaStreamConstraints;
      }[];
    };
    return {
      constraints: deviceCaptures.at(-1)!.constraints,
      oldStopped: deviceCaptures
        .slice(0, -1)
        .every((capture) =>
          capture.stream
            .getTracks()
            .every((track) => track.readyState === "ended"),
        ),
    };
  });
  expect(capture.constraints).toMatchObject({
    audio: {
      deviceId: { exact: "mic-2" },
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
    },
    video: { deviceId: { exact: "cam-2" } },
  });
  expect(capture.oldStopped).toBe(true);
  await page.evaluate(() => {
    const state = window as unknown as {
      missingCamera: boolean;
      deviceCaptures: { stream: MediaStream }[];
    };
    state.missingCamera = true;
    const track = state.deviceCaptures.at(-1)!.stream.getVideoTracks()[0];
    track.stop();
    track.dispatchEvent(new Event("ended"));
    navigator.mediaDevices.dispatchEvent(new Event("devicechange"));
  });
  await expect(deviceError).toContainText("Thiết bị đã ngắt kết nối");
  await expect(startExam).toBeDisabled();
  await expect(camera.locator("option", { hasText: "Camera USB" })).toHaveCount(
    0,
  );
  await page.getByRole("button", { name: "Kết nối lại thiết bị" }).click();
  await expect(deviceError).toContainText(
    "Thiết bị đã chọn không còn khả dụng",
  );
  await expect(camera).toHaveValue("cam-2");
  await expect(startExam).toBeDisabled();
  await camera.selectOption("cam-1");
  await expect(deviceError).toHaveCount(0);
  await expect(startExam).toBeEnabled();
  // Late events from released devices must not invalidate the new connection.
  await page.evaluate(() => {
    const { deviceCaptures } = window as unknown as {
      deviceCaptures: { stream: MediaStream }[];
    };
    deviceCaptures[0].stream
      .getAudioTracks()[0]
      .dispatchEvent(new Event("ended"));
  });
  await expect(deviceError).toHaveCount(0);
  await expect(startExam).toBeEnabled();
  await expectNoDesktopAudioControls(page);
  await startExam.click();
  await page
    .getByRole("button", { name: "Bắt đầu trả lời", exact: true })
    .click();
  await page.waitForTimeout(1200);
  await page.evaluate(() => {
    const state = window as unknown as {
      missingMicrophone: boolean;
      deviceCaptures: { stream: MediaStream }[];
    };
    state.missingMicrophone = true;
    const track = state.deviceCaptures.at(-1)!.stream.getAudioTracks()[0];
    track.stop();
    track.dispatchEvent(new Event("ended"));
    navigator.mediaDevices.dispatchEvent(new Event("devicechange"));
  });
  await expect(deviceError).toContainText("Thiết bị đã ngắt kết nối");
  await expect(
    page.getByRole("button", { name: "Kết thúc trả lời", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("textbox", { name: "Transcript", exact: true }),
  ).toHaveValue("The recording survives a disconnected microphone.");
  await page.getByRole("button", { name: "Ghi lại", exact: true }).click();
  const startAnswer = page.getByRole("button", {
    name: "Bắt đầu trả lời",
    exact: true,
  });
  await expect(startAnswer).toBeDisabled();
  await page.getByRole("button", { name: "Kết nối lại thiết bị" }).click();
  await expect(deviceError).toContainText(
    "Thiết bị đã chọn không còn khả dụng",
  );
  await expect(mic).toHaveValue("mic-2");
  await expect(startAnswer).toBeDisabled();
  await mic.selectOption("mic-1");
  await expect(deviceError).toHaveCount(0);
  await expect(startAnswer).toBeEnabled();
  await expectNoDesktopAudioControls(page);
  await expectNoDesktopAudioProcessing(page);
  expect(audioAssetRequests).toEqual([]);
  // Recovery allows another real recording without a preflight or skip step.
  await startAnswer.click();
  await page.waitForTimeout(1200);
  await page
    .getByRole("button", { name: "Kết thúc trả lời", exact: true })
    .click();
  await expect(
    page.getByRole("textbox", { name: "Transcript", exact: true }),
  ).toHaveValue("The recording survives a disconnected microphone.");
  await expectNoDesktopAudioProcessing(page);
  expect(audioAssetRequests).toEqual([]);
  const released = await page.evaluate(() => {
    const probe = (
      window as unknown as { desktopAudioProbe: DesktopAudioProbe }
    ).desktopAudioProbe;
    return {
      oldStreamsStopped: probe.captures
        .slice(0, -1)
        .every(({ stream }) =>
          stream.getTracks().every((track) => track.readyState === "ended"),
        ),
      oldContextsClosed: probe.contexts
        .slice(0, -1)
        .every((context) => context.state === "closed"),
      recorders: probe.recorders.map((recorder) => recorder.state),
    };
  });
  expect(released.oldStreamsStopped).toBe(true);
  expect(released.oldContextsClosed).toBe(true);
  expect(released.recorders).toEqual([
    "inactive",
    "inactive",
    "inactive",
    "inactive",
  ]);
});
