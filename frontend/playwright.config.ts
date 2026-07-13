import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  timeout: 30_000,
  expect: { timeout: 8_000 },
  use: {
    baseURL: "http://127.0.0.1:5288",
    trace: "retain-on-failure"
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], ...(process.env.CI ? {} : { channel: "chrome" as const }) }
    }
  ],
  webServer: [
    {
      command: "cross-env NODE_ENV=e2e CRM_STORE=memory PORT=4288 npm run dev --workspace backend",
      cwd: "..",
      url: "http://127.0.0.1:4288/api/health",
      reuseExistingServer: false,
      timeout: 20_000
    },
    {
      command: "cross-env VITE_API_TARGET=http://127.0.0.1:4288 npm run dev --workspace frontend -- --port 5288",
      cwd: "..",
      url: "http://127.0.0.1:5288/",
      reuseExistingServer: false,
      timeout: 20_000
    }
  ]
});
