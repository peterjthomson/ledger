import { test, expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test'
import * as path from 'path'
import * as fs from 'fs'
import * as os from 'os'
import { execFileSync } from 'child_process'
import { electronTestEnv } from './electron-test-env'

function runGit(args: string[], cwd: string) {
  execFileSync('git', args, { cwd, stdio: 'pipe' })
}

function createRepo(repoPath: string) {
  fs.mkdirSync(repoPath, { recursive: true })
  runGit(['init', '-b', 'main'], repoPath)
  runGit(['config', 'user.name', 'Ledger Test'], repoPath)
  runGit(['config', 'user.email', 'ledger@example.com'], repoPath)
  fs.writeFileSync(path.join(repoPath, 'README.md'), `# ${path.basename(repoPath)}\n`)
  runGit(['add', 'README.md'], repoPath)
  runGit(['commit', '-m', 'Initial commit'], repoPath)
}

test.describe('Ledger App - Repo selection detail', () => {
  let app: ElectronApplication
  let page: Page
  let tempRoot: string

  test.beforeAll(async () => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ledger-repo-select-'))
    createRepo(path.join(tempRoot, 'repo-one'))
    createRepo(path.join(tempRoot, 'repo-two'))
    createRepo(path.join(tempRoot, 'repo-three'))

    const settingsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ledger-tests-'))
    const settingsPath = path.join(settingsDir, 'ledger-settings.json')

    app = await electron.launch({
      args: [path.join(__dirname, '../out/main/main.js'), `--repo=${path.join(tempRoot, 'repo-one')}`],
      env: electronTestEnv({ LEDGER_SETTINGS_PATH: settingsPath }),
    })

    page = await app.firstWindow()
    await page.waitForLoadState('domcontentloaded')
    await expect(page.getByTestId('main-content')).toBeVisible({ timeout: 15000 })
  })

  test.afterAll(async () => {
    if (app) await app.close()
    fs.rmSync(tempRoot, { recursive: true, force: true })
  })

  test('selecting a repo in the picker shows its details in the editor', async () => {
    await page.getByTestId('view-toggle-focus').click()
    await expect(page.getByTestId('canvas-layout-focus')).toBeVisible()

    const reposSection = page.getByTestId('sidebar-section-repos')
    await reposSection.locator('.sidebar-section-header').click()
    await expect(reposSection.getByText('repo-two')).toBeVisible({ timeout: 10000 })

    // Single click = select. The editor should show the repo detail panel.
    await reposSection.getByText('repo-two').click()
    const editor = page.locator('.editor-slot-content')
    await expect(editor.locator('.detail-type-badge')).toHaveText('Repository', { timeout: 5000 })
    await expect(editor.locator('.detail-title')).toHaveText('repo-two')

    // Selecting a different repo should update the view
    await reposSection.getByText('repo-three').click()
    await expect(editor.locator('.detail-title')).toHaveText('repo-three', { timeout: 5000 })
  })
})
