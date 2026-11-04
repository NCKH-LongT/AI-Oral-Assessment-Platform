import { defineConfig } from "@playwright/test";
import base from "./playwright.config";
export default defineConfig({
  ...base,
  use: { ...base.use, channel: process.env.E2E_BROWSER_CHANNEL || "msedge" },
});
