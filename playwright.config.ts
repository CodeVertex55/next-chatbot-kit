import { defineConfig, devices } from "@playwright/test";

const PORT = 3210;
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "e2e",
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: "list",
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command: `npm run build && npm run start -- -p ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: false,
    timeout: 300_000,
    env: {
      // Empty values win over .env.local, so the run always uses the holding reply.
      ANTHROPIC_API_KEY: "",
      SITE_URL: BASE_URL,
    },
  },
});
