import { defineConfig, devices } from '@playwright/test'

const PORT = 3998

export default defineConfig({
  testDir: 'e2e',
  // *.e2e.ts, so `bun test` (which picks up *.test.ts and *.spec.ts) leaves these alone.
  testMatch: '**/*.e2e.ts',
  // One shared database: run tests one at a time, in file order.
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  // Playwright starts the real app (production build) and waits for it.
  webServer: {
    command: 'bun run e2e/prepare.ts && bun run build && bun run dist/index.js',
    url: `http://localhost:${PORT}/shop`,
    env: { PORT: String(PORT), DATABASE_URL: 'postgres://postgres:postgres@localhost:5433/app_e2e' },
    reuseExistingServer: false,
    timeout: 60_000,
  },
})
