import { openWebPractice } from "./helpers/web-practice";
import { test, expect } from "@playwright/test";

for (const mode of [
  "browser",
  "old-desktop",
  "missing-model",
  "broken-preferences",
  "saved-legacy-model",
] as const) {
  test(`desktop language settings handle ${mode}`, async ({ page }) => {
    await page.addInitScript((mode) => {
      if (mode === "browser") return;
      localStorage.setItem(
        "oral-desktop-speech-v1",
        mode === "broken-preferences"
          ? "invalid json"
          : JSON.stringify({ model: "phowhisper-small", language: "en" }),
      );
      window.oralDesktop = {
        transcribe: async () => {
          throw new Error("This test must not transcribe");
        },
        ...(mode === "old-desktop"
          ? {}
          : {
              sttModels: async () => [
                {
                  id: "whisper-small" as const,
                  label: "Whisper-small",
                  available: mode !== "missing-model",
                },
              ],
            }),
      };
    }, mode);
    await page.route("**/api/**", async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path.endsWith("/auth/me"))
        return route.fulfill({
          json: {
            id: "student",
            name: "Student",
            role: mode === "browser" ? "TEACHER" : "STUDENT",
          },
        });
      if (path.endsWith("/exams/available"))
        return route.fulfill({
          json: [
            {
              id: "exam",
              name: "Test",
              time_limit: 600,
              question_count: 1,
              status: "ASSIGNED",
            },
          ],
        });
      if (path.includes("/exam-sessions"))
        return route.fulfill({
          json: {
            id: "session",
            exam_name: "Test",
            status: "DEVICE_CHECK",
            time_limit: 600,
            question_count: 1,
            answered_count: 0,
            current_attempt: null,
          },
        });
      return route.fulfill({ json: {} });
    });
    if (mode === "browser") await openWebPractice(page);
    else await page.goto("/");
    await page.getByRole("button", { name: "Mở bài thi" }).click();
    const model = page.getByRole("combobox", {
      name: "Model nhận dạng",
      exact: true,
    });
    await expect(model).toHaveCount(0);
    const group = page.getByRole("group", {
      name: "Nhận dạng giọng nói trên desktop",
      exact: true,
    });
    const language = page.getByRole("combobox", {
      name: "Ngôn ngữ nói",
      exact: true,
    });
    if (mode === "browser") {
      await expect(group).toHaveCount(0);
    } else if (mode === "old-desktop") {
      await expect(group.getByRole("alert")).toContainText(
        "Đóng/mở lại desktop phiên bản mới",
      );
      await expect(language).toBeDisabled();
    } else {
      await expect(language).toBeEnabled();
      await expect(language).toHaveValue(
        mode === "broken-preferences" ? "vi" : "en",
      );
      if (mode === "missing-model") {
        await expect(group.getByRole("alert")).toContainText(
          "Chưa có bộ nhận dạng Whisper-small",
        );
      } else {
        await expect(group.getByRole("alert")).toHaveCount(0);
      }
    }
  });
}
