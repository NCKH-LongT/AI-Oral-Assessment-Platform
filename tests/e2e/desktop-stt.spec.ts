import { test, expect } from "@playwright/test";
import type { SpeechPolicy } from "../../apps/admin-web/components/api";
import {
  expectNoDesktopAudioControls,
  expectNoDesktopAudioProcessing,
  observeDesktopAudio,
  type DesktopAudioProbe,
} from "./helpers/desktop-audio";

for (const [model, language, failure] of [
  ["phowhisper-small", "vi", "none"],
  ["whisper-small", "en", "retry"],
  ["whisper-small", "vi", "initial"],
  ["phowhisper-small", "en", "none"],
] as const)
  test(`desktop ${model}/${language} records and retries raw audio (${failure} failure)`, async ({
    page,
  }) => {
    const audioAssetRequests = await observeDesktopAudio(page);
    const transcript =
      "Whisper local supplies this transcript for Gemini grading.";
    const localHashes: string[] = [];
    const policies: SpeechPolicy[] = [];
    let uploadedAudioHash: string | undefined;
    let submitted: unknown;
    const serverSttCalls: string[] = [];
    await page.exposeFunction(
      "recordLocalStt",
      (hash: string, policy: SpeechPolicy) => {
        localHashes.push(hash);
        policies.push(policy);
        if (
          (failure === "retry" && localHashes.length === 2) ||
          (failure === "initial" && localHashes.length === 1)
        )
          throw new Error("Local STT failed");
      },
    );
    await page.addInitScript((transcript) => {
      window.oralDesktop = {
        sttModels: async () => [
          {
            id: "phowhisper-small",
            label: "PhoWhisper-small",
            available: true,
          },
          { id: "whisper-small", label: "Whisper-small", available: true },
        ],
        transcribe: async (audio, policy) => {
          if (!audio.byteLength || policy.provider !== "local")
            throw new Error("Expected recorded audio and a local STT policy");
          await (
            window as unknown as {
              recordLocalStt: (
                hash: string,
                policy: SpeechPolicy,
              ) => Promise<void>;
            }
          ).recordLocalStt(
            Array.from(
              new Uint8Array(await crypto.subtle.digest("SHA-256", audio)),
            )
              .map((x) => x.toString(16).padStart(2, "0"))
              .join(""),
            policy,
          );
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
          json: {
            provider: "google",
            language: "vi",
            preprocessing: "denoise",
            hotwords: ["Dependency Injection"],
          },
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
      if (path === "/api/uploads/init") {
        const body = route.request().postDataJSON();
        if (body.kind === "AUDIO") uploadedAudioHash = body.sha256;
        return route.fulfill({
          json: {
            id: route.request().postDataJSON().kind,
            chunk_size: 4194304,
            status: "COMPLETED",
          },
        });
      }
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
    const modelSelect = page.getByRole("combobox", {
      name: "Model nhận dạng",
      exact: true,
    });
    const languageSelect = page.getByRole("combobox", {
      name: "Ngôn ngữ nói",
      exact: true,
    });
    await expect(modelSelect).toBeEnabled();
    await modelSelect.selectOption(model);
    await languageSelect.selectOption(language);
    const startExam = page.getByRole("button", {
      name: "Bắt đầu thi",
      exact: true,
    });
    await expect(startExam).toBeDisabled();
    await expectNoDesktopAudioControls(page);
    await page.getByRole("button", { name: "Cho phép camera & mic" }).click();
    // Desktop starts immediately after connecting; no test or skip gate.
    await expect(startExam).toBeEnabled();
    await expectNoDesktopAudioControls(page);
    await expectNoDesktopAudioProcessing(page);
    await expect(
      page.getByRole("button", { name: /Gợi ý sửa chính tả/ }),
    ).toHaveCount(0);
    await page
      .getByRole("button", { name: "Bắt đầu thi", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Bắt đầu trả lời", exact: true })
      .click();
    // Wait for a real media chunk from Chromium's fake camera/mic.
    await page.waitForTimeout(1200);
    await expect(modelSelect).toBeDisabled();
    await expect(languageSelect).toBeDisabled();
    await expect(
      page.getByRole("combobox", { name: "Microphone", exact: true }),
    ).toBeDisabled();
    await expectNoDesktopAudioControls(page);
    await expect(
      page.getByRole("combobox", { name: "Camera", exact: true }),
    ).toBeDisabled();
    await page
      .getByRole("button", { name: "Kết thúc trả lời", exact: true })
      .click();
    const transcriptInput = page.getByRole("textbox", {
      name: "Transcript",
      exact: true,
    });
    const retry = page.getByRole("button", {
      name: "Thử STT lại",
      exact: true,
    });
    await expect(retry).toBeEnabled();
    if (failure === "initial") {
      await expect(page.getByText(/Local STT failed/)).toBeVisible();
      await expect(transcriptInput).toHaveValue("");
      await transcriptInput.fill(
        "A manually entered transcript remains possible.",
      );
    } else {
      await expect(transcriptInput).toHaveValue(transcript);
    }
    await expectNoDesktopAudioControls(page);
    expect(policies[0]).toMatchObject({
      provider: "local",
      preprocessing: "off",
      desktop_model: model,
      language,
      hotwords: ["Dependency Injection"],
    });
    const retryModel =
      model === "whisper-small" ? "phowhisper-small" : "whisper-small";
    const retryLanguage = language === "en" ? "vi" : "en";
    await modelSelect.selectOption(retryModel);
    await languageSelect.selectOption(retryLanguage);
    for (let index = 0; index < 3; index++) {
      await retry.click();
      await expect.poll(() => localHashes.length).toBe(index + 2);
      await expect(retry).toBeEnabled();
      if (failure === "retry" && index === 0)
        await expect(
          page.getByText("Local STT failed", { exact: true }),
        ).toBeVisible();
      await expect(transcriptInput).toHaveValue(transcript);
    }
    expect(localHashes.every((hash) => hash === localHashes[0])).toBe(true);
    expect(localHashes[0]).toMatch(/^[a-f0-9]{64}$/);
    await expectNoDesktopAudioControls(page);
    await expectNoDesktopAudioProcessing(page);
    const captured = await page.evaluate(() => {
      const probe = (
        window as unknown as { desktopAudioProbe: DesktopAudioProbe }
      ).desktopAudioProbe;
      const raw = probe.captures[0];
      return {
        captures: probe.captures.length,
        constraints: raw.constraints,
        rawAudioIds: raw.stream.getAudioTracks().map((track) => track.id),
        rawVideoIds: raw.stream.getVideoTracks().map((track) => track.id),
        recordings: probe.recordings,
      };
    });
    expect(captured.captures).toBe(1);
    expect(captured.constraints.audio).toMatchObject({
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
    });
    // Exactly the audio and video evidence recorders use the original mic;
    // there is no filtered alternative recorder or pre-exam test recording.
    expect(captured.recordings).toEqual([
      { audioTrackIds: captured.rawAudioIds, videoTrackIds: [] },
      {
        audioTrackIds: captured.rawAudioIds,
        videoTrackIds: captured.rawVideoIds,
      },
    ]);
    expect(audioAssetRequests).toEqual([]);
    const finalTranscript =
      failure !== "none" ? transcript + " Edited manually." : transcript;
    await page
      .getByRole("textbox", { name: "Transcript", exact: true })
      .fill(finalTranscript);
    await expect(
      page.getByRole("button", { name: /Gợi ý sửa chính tả/ }),
    ).toHaveCount(0);
    await page
      .getByRole("button", { name: "Nộp câu trả lời & tiếp tục" })
      .click();
    await expect(
      page.getByRole("button", { name: "Nộp bài thi", exact: true }),
    ).toBeEnabled();
    await page
      .getByRole("button", { name: "Nộp bài thi", exact: true })
      .click();
    await expect(page.locator(".finished")).toContainText("8/10");
    await expect
      .poll(() =>
        page.evaluate(() => {
          const probe = (
            window as unknown as { desktopAudioProbe: DesktopAudioProbe }
          ).desktopAudioProbe;
          return (
            probe.captures.every(({ stream }) =>
              stream.getTracks().every((track) => track.readyState === "ended"),
            ) &&
            probe.contexts.every((context) => context.state === "closed") &&
            probe.recorders.every((recorder) => recorder.state === "inactive")
          );
        }),
      )
      .toBe(true);
    expect(localHashes).toHaveLength(4);
    expect(uploadedAudioHash).toBe(localHashes[1]);
    expect(submitted).toEqual({
      transcript: finalTranscript,
      stt_confidence: failure !== "none" ? 0 : 0.99,
    });
    expect(serverSttCalls).toEqual([]);
    for (const policy of policies.slice(1))
      expect(policy).toMatchObject({
        provider: "local",
        preprocessing: "off",
        desktop_model: retryModel,
        language: retryLanguage,
        hotwords: ["Dependency Injection"],
      });
    session.status = "DEVICE_CHECK";
    await page.reload();
    await page.getByRole("button", { name: "Mở bài thi" }).click();
    await expect(modelSelect).toHaveValue(retryModel);
    await expect(languageSelect).toHaveValue(retryLanguage);
    await expectNoDesktopAudioControls(page);
    expect(audioAssetRequests).toEqual([]);
  });
