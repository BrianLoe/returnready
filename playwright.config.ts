import { defineConfig, devices } from '@playwright/test';

// Task 7: real-browser proof that the manual (human) path works end to end
// -- including in a browser where WebMCP is unavailable, which is the
// expected case on a plain localhost origin with no WebMCP origin trial
// (see `docs/testing/gate-0-webmcp.md`). Serves the app with the project's
// own `npm run dev` (127.0.0.1, matching AGENTS.md's "no cross-origin
// exposure" posture) rather than inventing a separate static server.
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:5173',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
