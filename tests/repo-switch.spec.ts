import { test, expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test'
import * as path from 'path'
import * as fs from 'fs'
import * as os from 'os'
import { execFileSync } from 'child_process'
import { electronTestEnv } from './electron-test-env'

function runGit(args: string[], cwd: string) {
  execFileSync('git', args, {
    cwd,
    stdio: 'pipe',
  })
}

function createRepo(repoPath: string, branchName: string) {
  fs.mkdirSync(repoPath, { recursive: true })
  runGit(['init', '-b', 'main'], repoPath)
  runGit(['config', 'user.name', 'Ledger Test'], repoPath)
  runGit(['config', 'user.email', 'ledger@example.com'], repoPath)

  fs.writeFileSync(path.join(repoPath, 'README.md'), `# ${path.basename(repoPath)}\n`)
  runGit(['add', 'README.md'], repoPath)
  runGit(['commit', '-m', 'Initial commit'], repoPath)

  runGit(['checkout', '-b', branchName], repoPath)
  fs.writeFileSync(path.join(repoPath, `${branchName}.txt`), `${branchName}\n`)
  runGit(['add', `${branchName}.txt`], repoPath)
  runGit(['commit', '-m', `Add ${branchName}`], repoPath)
  runGit(['checkout', 'main'], repoPath)
}

test.describe('Ledger App - Repo Switching', () => {
  let app: ElectronApplication
  let page: Page
  let settingsPath: string
  let tempRoot: string
  let repoOnePath: string
  let repoTwoPath: string

  test.beforeAll(async () => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ledger-repo-switch-'))
    repoOnePath = path.join(tempRoot, 'repo-one')
    repoTwoPath = path.join(tempRoot, 'repo-two')
    createRepo(repoOnePath, 'alpha-only')
    createRepo(repoTwoPath, 'beta-only')

    const settingsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ledger-tests-'))
    settingsPath = path.join(settingsDir, 'ledger-settings.json')

    app = await electron.launch({
      args: [path.join(__dirname, '../out/main/main.js'), `--repo=${repoOnePath}`],
      env: electronTestEnv({ LEDGER_SETTINGS_PATH: settingsPath }),
    })

    page = await app.firstWindow()
    await page.waitForLoadState('domcontentloaded')
    await expect(page.getByTestId('main-content')).toBeVisible({ timeout: 15000 })
  })

  test.afterAll(async () => {
    if (app) {
      await app.close()
    }
    fs.rmSync(tempRoot, { recursive: true, force: true })
  })

  test('switching sibling repos updates branch data', async () => {
    await page.getByTestId('view-toggle-focus').click()
    await expect(page.getByTestId('canvas-layout-focus')).toBeVisible()

    const branchesSection = page.getByTestId('sidebar-section-branches')
    await expect(branchesSection.getByText('alpha-only')).toBeVisible({ timeout: 10000 })

    const reposSection = page.getByTestId('sidebar-section-repos')
    await reposSection.locator('.sidebar-section-header').click()
    await expect(reposSection.getByText('repo-two')).toBeVisible()
    await reposSection.getByText('repo-two').dblclick()

    await expect(branchesSection.getByText('beta-only')).toBeVisible({ timeout: 10000 })
    await expect(branchesSection.getByText('alpha-only')).toHaveCount(0)
  })
})
