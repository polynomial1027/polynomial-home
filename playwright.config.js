const { defineConfig } = require('@playwright/test');
module.exports = defineConfig({
  testDir: './tests/browser', timeout: 30000, workers: 1, fullyParallel: false,
  use: { baseURL: 'http://127.0.0.1:3190', trace: 'retain-on-failure', screenshot: 'only-on-failure', serviceWorkers: 'allow', launchOptions: process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : {} },
  webServer: { command: 'node tests/browser/fixture-server.cjs', url: 'http://127.0.0.1:3190/api/health', reuseExistingServer: false, timeout: 30000 },
  reporter: [['list'], ['html', { open: 'never' }]]
});
