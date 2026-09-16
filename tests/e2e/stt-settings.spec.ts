import { test, expect } from "@playwright/test";

for (const initialProvider of ["local_server", "google", "gemini"]) {
  test(`Gemini with ${initialProvider}: save Whisper without Google JSON`, async ({
    page,
  }) => {
    const writes: unknown[] = [];
    let speech = {
      provider: initialProvider,
      preprocessing: "denoise",
      language: "vi",
      server_model: "base",
      google_configured: false,
      google_credentials: { status: "missing", source: "none" },
    };
    // All APIs are synthetic, including writes; no deployed data is touched.
    await page.route("**/api/**", async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path === "/api/auth/me")
        return route.fulfill({
          json: {
            id: "admin",
            name: "Admin",
            username: "admin",
            role: "ADMIN",
          },
        });
      if (path === "/api/admin/settings/platform")
        return route.fulfill({
          json: {
            ai_provider: "gemini",
            llm_model: "gemini-2.5-flash",
            embedding_model: "gemini-embedding-001",
            stt_model: "base",
            gemini_key_configured: true,
            google_login_enabled: false,
            google_client_id: "",
            google_secret_configured: false,
            public_origin: "http://localhost:3000",
          },
        });
      if (path === "/api/admin/settings/speech") {
        if (route.request().method() === "PUT") {
          const body = route.request().postDataJSON();
          writes.push(body);
          speech = { ...speech, ...body };
        }
        return route.fulfill({ json: speech });
      }
      if (path.endsWith("google-credentials"))
        throw new Error("Whisper setup must not upload a Google JSON");
      return route.fulfill({
        json: path.endsWith("dashboard")
          ? {
              courses: 0,
              documents: 0,
              exams: 0,
              sessions: 0,
              ai_provider: "gemini",
            }
          : [],
      });
    });
    await page.goto("/");
    await page
      .getByRole("button", { name: "Cấu hình hệ thống", exact: true })
      .click();
    await expect(page.getByText(/Gemini chỉ cần API key/)).toBeVisible();
    await page
      .getByRole("button", { name: "STT & giọng nói", exact: true })
      .click();
    await expect(page.getByLabel("Nhà cung cấp STT")).toHaveValue(
      initialProvider,
    );
    await page.getByLabel("Nhà cung cấp STT").selectOption("local");
    await page.getByLabel("Ngôn ngữ nhận dạng").selectOption("en");
    await expect(
      page.getByLabel("File JSON service account Google (tối đa 64 KB)"),
    ).toBeHidden();
    await page
      .getByRole("button", { name: "Lưu cấu hình STT", exact: true })
      .click();
    await expect(
      page.getByText("Đã lưu cấu hình STT.", { exact: true }),
    ).toBeVisible();
    expect(writes).toEqual([
      { provider: "local", preprocessing: "off", language: "en" },
    ]);
    await expect(page.getByLabel("Nhà cung cấp STT")).toHaveValue("local");
    await expect(page.getByLabel("Ngôn ngữ nhận dạng")).toHaveValue("en");
    // Reload shows the saved policy, rather than returning to the original Google setting.
    await page.reload();
    await page
      .getByRole("button", { name: "Cấu hình hệ thống", exact: true })
      .click();
    await page
      .getByRole("button", { name: "STT & giọng nói", exact: true })
      .click();
    await expect(page.getByLabel("Nhà cung cấp STT")).toHaveValue("local");
  });
}
