import { test, expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test'
import * as path from 'path'
import * as fs from 'fs'
import * as os from 'os'
import { execFileSync } from 'child_process'
import { electronTestEnv } from './electron-test-env'

function runGit(args: string[], cwd: string) {
  execFileSync('git', args, { cwd, stdio: 'pipe' })
}

function initRepo(repoPath: string) {
  fs.mkdirSync(repoPath, { recursive: true })
  runGit(['init', '-b', 'main'], repoPath)
  runGit(['config', 'user.name', 'Ledger Test'], repoPath)
  runGit(['config', 'user.email', 'ledger@example.com'], repoPath)
  fs.writeFileSync(path.join(repoPath, 'README.md'), `# ${path.basename(repoPath)}\n`)
  runGit(['add', 'README.md'], repoPath)
  runGit(['commit', '-m', 'Initial commit'], repoPath)
}

/** A repo with lots of branches, so deferred metadata loading is slow. */
function createSlowRepo(repoPath: string, branchCount: number) {
  initRepo(repoPath)
  for (let i = 0; i < branchCount; i++) {
    const branch = `alpha-${i}`
    runGit(['checkout', '-b', branch], repoPath)
    fs.writeFileSync(path.join(repoPath, `${branch}.txt`), `${branch}\n`)
    runGit(['add', `${branch}.txt`], repoPath)
    runGit(['commit', '-m', `Add ${branch}`], repoPath)
    runGit(['checkout', 'main'], repoPath)
  }
}

function createFastRepo(repoPath: string, branchName: string) {
  initRepo(repoPath)
  runGit(['checkout', '-b', branchName], repoPath)
  fs.writeFileSync(path.join(repoPath, `${branchName}.txt`), `${branchName}\n`)
  runGit(['add', `${branchName}.txt`], repoPath)
  runGit(['commit', '-m', `Add ${branchName}`], repoPath)
  runGit(['checkout', 'main'], repoPath)
}

test.describe('Ledger App - Repo switch race', () => {
  let app: ElectronApplication
  let page: Page
  let tempRoot: string
  let slowRepoPath: string
  let fastRepoPath: string

  test.beforeAll(async () => {
    test.setTimeout(180000)
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ledger-switch-race-'))
    slowRepoPath = path.join(tempRoot, 'repo-slow')
    fastRepoPath = path.join(tempRoot, 'repo-fast')
    createSlowRepo(slowRepoPath, 60)
    createFastRepo(fastRepoPath, 'beta-only')

    const settingsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ledger-tests-'))
    const settingsPath = path.join(settingsDir, 'ledger-settings.json')

    app = await electron.launch({
      args: [path.join(__dirname, '../out/main/main.js'), `--repo=${slowRepoPath}`],
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

  test('switching away mid-load does not resurrect the previous repo data', async () => {
    await page.getByTestId('view-toggle-focus').click()
    await expect(page.getByTestId('canvas-layout-focus')).toBeVisible()

    const branchesSection = page.getByTestId('sidebar-section-branches')
    await expect(branchesSection.getByText('alpha-0', { exact: true })).toBeVisible({ timeout: 20000 })

    // Two picks in quick succession (a stray double-click, or picking again while the
    // first is still opening). The slower one must not win.
    await page.evaluate(async (p) => {
      void (window as any).conveyor.repo.openRepository(p)
    }, slowRepoPath)
    await page.evaluate(async (p) => {
      await (window as any).conveyor.repo.openRepository(p)
    }, fastRepoPath)

    // The main process must be on the new repo.
    const activePath = await page.evaluate(async () => {
      return await (window as any).conveyor.repo.getRepoPath()
    })
    expect(activePath).toContain('repo-fast')

    await expect(branchesSection.getByText('beta-only')).toBeVisible({ timeout: 15000 })

    // The stale load of repo-slow must never overwrite repo-fast's data.
    await page.waitForTimeout(5000)
    await expect(branchesSection.getByText('alpha-0', { exact: true })).toHaveCount(0)
    await expect(branchesSection.getByText('beta-only')).toBeVisible()
  })
})
