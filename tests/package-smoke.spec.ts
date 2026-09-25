import { test, expect, _electron as electron, type ElectronApplication } from '@playwright/test'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { electronTestEnv } from './electron-test-env'

// npm run test:packaged validates LEDGER_PACKAGED_EXECUTABLE before collecting tests.
test('#48 packaged app loads external and native dependencies without the source checkout', async () => {
  const executablePath = process.env.LEDGER_PACKAGED_EXECUTABLE
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ledger-package-'))
  let app: ElectronApplication | undefined
  try {
    app = await electron.launch({
      executablePath,
      cwd: root,
      env: electronTestEnv({ LEDGER_SETTINGS_PATH: path.join(root, 'settings.json'), NODE_PATH: '' }),
    })
    const page = await app.firstWindow()
    await expect(page.getByText('Welcome to Ledger')).toBeVisible()
    const result = await app.evaluate(async ({ app }) => {
      const { createRequire } = process.getBuiltinModule('module')
      const localRequire = createRequire(app.getAppPath() + '/out/main/main.js')
      const dependencies = ['simple-git', 'zod', '@electron-toolkit/utils', 'better-sqlite3']
      const resolved = dependencies.map((name) => {
        localRequire(name)
        return localRequire.resolve(name)
      })
      const Database = localRequire('better-sqlite3')
      const database = new Database(':memory:')
      const row = database.prepare('SELECT 1 AS healthy').get()
      database.close()
      return { appPath: app.getAppPath(), resolved, row }
    })
    expect(result.appPath).toContain('app.asar')
    expect(result.resolved.every((p) => p.startsWith(result.appPath))).toBe(true)
    expect(result.row).toEqual({ healthy: 1 })
  } finally {
    try {
      await app?.close()
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  }
})
