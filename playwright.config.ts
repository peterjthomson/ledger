import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests',
  testIgnore: '**/package-smoke.spec.ts', // Run explicitly with npm run test:packaged
  timeout: 30000,
  expect: {
    timeout: 5000,
  },
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1, // Electron tests should run serially
  reporter: 'list',
  use: {
    trace: 'on-first-retry',
  },
})

