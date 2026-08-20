// @ts-check
const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: '.',
  testMatch: '*.spec.js',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['html', { open: 'never' }], ['list']] : 'list',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
    // Unset in CI — playwright install puts the browser where Playwright
    // expects it. Set only for a local run against a pre-installed browser
    // whose path doesn't match this package's pinned revision.
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH }
      : {},
  },
  // Serves the repo root as-is — no build step, matching the app itself.
  webServer: {
    command: 'python3 -m http.server 4173 --directory ../..',
    url: 'http://127.0.0.1:4173/index.html',
    reuseExistingServer: !process.env.CI,
  },
  // Two projects stand in for the four-corner matrix the render loop always
  // checked by hand (390/900 x light/dark x motion).
  //
  // ⚠️ `use.reducedMotion` and `use.colorScheme` here are config, not
  // enforcement — found while building this harness: on this Chromium build,
  // setting reducedMotion as a context option does not reliably reach
  // matchMedia() by the time the page's own script runs. helpers/app.js reads
  // these two values back out of the active project (test.info().project.use)
  // and applies them itself via page.emulateMedia() before navigating, which
  // does work. Don't rely on the bare context option elsewhere without the
  // same explicit call — colorScheme happens to work either way, but nothing
  // guarantees that holds on a different browser build.
  projects: [
    {
      name: 'mobile-light-reduced',
      use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 }, colorScheme: 'light', reducedMotion: 'reduce' },
    },
    {
      name: 'desktop-dark-motion',
      use: { ...devices['Desktop Chrome'], viewport: { width: 900, height: 900 }, colorScheme: 'dark', reducedMotion: 'no-preference' },
    },
  ],
});
