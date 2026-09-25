/**
 * Build an env for Playwright's electron.launch.
 *
 * Harnesses sometimes set ELECTRON_RUN_AS_NODE=1, which makes the Electron
 * binary behave like Node and reject Chromium flags such as
 * --remote-debugging-port that Playwright requires.
 */
export function electronTestEnv(overrides: Record<string, string | undefined> = {}): Record<string, string> {
  const env: NodeJS.ProcessEnv = { ...process.env, ...overrides }
  delete env.ELECTRON_RUN_AS_NODE
  return Object.fromEntries(Object.entries(env).filter((entry): entry is [string, string] => entry[1] !== undefined))
}
