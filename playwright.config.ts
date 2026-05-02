import { defineConfig, devices } from "@playwright/test";

const HOST = "localhost";
const E2E_PORT = 5174;
const BASE_URL = `http://${HOST}:${E2E_PORT}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : 4,
  reporter: "html",
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1280, height: 800 },
      },
    },
  ],
  webServer: {
    command: `npx concurrently --names backend,frontend -c blue,green "pnpm run dev:backend" "pnpm run dev:frontend -- --host ${HOST} --port ${E2E_PORT} --strictPort"`,
    url: BASE_URL,
    timeout: 120_000,
    reuseExistingServer: !!process.env.PLAYWRIGHT_REUSE_SERVER,
    env: {
      ...process.env,
      VITE_E2E: "1",
    },
  },
});
