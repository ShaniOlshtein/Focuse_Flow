import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests",
  timeout: 90_000,
  workers: 1,
  reporter: "list",
  use: { channel: "chromium", baseURL: process.env.BASE_URL ?? "http://localhost:3000", locale: "he-IL", trace: "retain-on-failure" },
});
