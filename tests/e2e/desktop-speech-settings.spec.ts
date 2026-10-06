import { test, expect } from "@playwright/test";

for (const mode of [
  "browser",
  "old-desktop",
  "missing-model",
  "broken-preferences",
] as const) {
  test(`speech selection handles ${mode}`, async ({ page }) => {
    await page.addInitScript((mode) => {
      if (mode === "browser") return;
      localStorage.setItem(
        "oral-desktop-speech-v1",
        mode === "broken-preferences"
          ? "invalid json"
          : JSON.stringify({ model: "whisper-small", language: "en" }),
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
                  id: "phowhisper-small" as const,
                  label: "PhoWhisper-small",
                  available: true,
                },
                {
                  id: "whisper-small" as const,
                  label: "Whisper-small",
                  available: false,
                },
              ],
            }),
      };
    }, mode);
    await page.route("**/api/**", async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path.endsWith("/auth/me"))
        return route.fulfill({
          json: { id: "student", name: "Student", role: "STUDENT" },
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
    await page.goto("/");
    await page.getByRole("button", { name: "Mở bài thi" }).click();
    const model = page.getByRole("combobox", {
      name: "Model nhận dạng",
      exact: true,
    });
    if (mode === "browser") {
      await expect(model).toHaveCount(0);
    } else if (mode === "old-desktop") {
      await expect(
        page
          .getByRole("group", {
            name: "Nhận dạng giọng nói trên desktop",
            exact: true,
          })
          .getByRole("alert"),
      ).toContainText("Đóng/mở lại desktop phiên bản mới");
      await expect(model).toBeDisabled();
    } else {
      await expect(model).toBeEnabled();
      await expect(
        model.locator('option[value="whisper-small"]'),
      ).toHaveJSProperty("disabled", true);
      if (mode === "missing-model") {
        await expect(model).toHaveValue("whisper-small");
        await expect(
          page
            .getByRole("group", {
              name: "Nhận dạng giọng nói trên desktop",
              exact: true,
            })
            .getByRole("alert"),
        ).toContainText("Model đã chọn chưa có trên máy");
        await model.selectOption("phowhisper-small");
        await expect(
          page
            .getByRole("group", {
              name: "Nhận dạng giọng nói trên desktop",
              exact: true,
            })
            .getByRole("alert"),
        ).toHaveCount(0);
      } else {
        await expect(model).toHaveValue("phowhisper-small");
        await expect(
          page.getByRole("combobox", { name: "Ngôn ngữ nói", exact: true }),
        ).toHaveValue("vi");
      }
    }
  });
}
