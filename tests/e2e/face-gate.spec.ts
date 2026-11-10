import { test, expect } from "@playwright/test";
import fs from "node:fs";

test("real face model gates exam entry and rejects a frozen camera", async ({
  page,
}) => {
  const fixture = process.env.VISION_FIXTURE || ".data/mediapipe-portrait.jpg";
  test.skip(
    !fs.existsSync(fixture),
    "Download the public MediaPipe portrait fixture first; see architecture guide.",
  );
  await page.route("**/face-test-fixture.jpg", (route) =>
    route.fulfill({
      contentType: "image/jpeg",
      body: fs.readFileSync(fixture),
    }),
  );
  await page.addInitScript(() => {
    window.oralDesktop = {
      policyVersion: 1,
      beginExam: async () => {},
      endExam: async () => {},
      transcribe: async () => ({ transcript: "", stt_confidence: 0 }),
      sttModels: async () => [],
    };
    const original = navigator.mediaDevices.getUserMedia.bind(
      navigator.mediaDevices,
    );
    Object.assign(window, { faceTestVisible: false });
    navigator.mediaDevices.getUserMedia = async (constraints) => {
      const stream = await original(constraints);
      if (constraints?.video) {
        for (const track of stream.getVideoTracks()) {
          stream.removeTrack(track);
          track.stop();
        }
        const image = new Image();
        image.src = "/face-test-fixture.jpg";
        await image.decode();
        const canvas = document.createElement("canvas");
        canvas.width = image.width;
        canvas.height = image.height;
        const ctx = canvas.getContext("2d")!;
        const paint = () => {
          ctx.fillStyle = "white";
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          if (
            (window as unknown as { faceTestVisible: boolean }).faceTestVisible
          )
            ctx.drawImage(
              image,
              image.width * 0.22,
              0,
              image.width * 0.55,
              image.height * 0.43,
              canvas.width * 0.2,
              canvas.height * 0.15,
              canvas.width * 0.6,
              canvas.height * 0.7,
            );
        };
        paint();
        setInterval(paint, 100);
        for (const track of canvas.captureStream(10).getVideoTracks())
          stream.addTrack(track);
      }
      return stream;
    };
  });
  const session = {
    id: "face-session",
    exam_name: "Camera gate test",
    status: "DEVICE_CHECK",
    server_processing: true,
    time_limit: 600,
    question_count: 1,
    answered_count: 0,
    started_at: null,
    server_time: Date.now() / 1000,
    current_attempt: null,
    desktop_policy: {
      require_camera: true,
      require_screen: false,
      block_clipboard: false,
      pause_on_focus_loss: false,
      single_display: false,
    },
  };
  await page.route("**/api/**", (route) => {
    const path = new URL(route.request().url()).pathname;
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
            time_limit: 600,
            question_count: 1,
            status: "ASSIGNED",
          },
        ],
      });
    return route.fulfill({ json: session });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Mở bài thi" }).click();
  await page.getByRole("button", { name: "Cho phép camera & mic" }).click();
  const start = page.getByRole("button", { name: "Bắt đầu thi", exact: true });
  await expect(start).toBeDisabled();
  await expect(
    page.getByRole("status").filter({ hasText: "Khung mặt:" }),
  ).toContainText("Chưa thấy mặt", { timeout: 30000 });
  await page.evaluate(() => Object.assign(window, { faceTestVisible: true }));
  await expect(start).toBeEnabled({ timeout: 20000 });
  await page
    .locator("video")
    .evaluate((video: HTMLVideoElement) => video.pause());
  await expect(start).toBeDisabled({ timeout: 6000 });
});
