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
  fs.writeFileSync(path.join(repoPath, 'README.md'), '# fixture\n')
  runGit(['add', 'README.md'], repoPath)
  runGit(['commit', '-m', 'Initial commit'], repoPath)

  for (const branch of ['zebra-branch', 'apple-branch']) {
    runGit(['checkout', '-b', branch], repoPath)
    fs.writeFileSync(path.join(repoPath, `${branch}.txt`), `${branch}\n`)
    runGit(['add', `${branch}.txt`], repoPath)
    runGit(['commit', '-m', `Add ${branch}`], repoPath)
    runGit(['checkout', 'main'], repoPath)
  }
}

/** Option labels offered by a radar column header's control selects. */
async function radarColumnOptions(page: Page, panelSelector: string) {
  const panel = page.locator(panelSelector)
  await panel.locator('.header-filter-btn').first().click()
  const selects = panel.locator('.column-controls .control-select')
  const count = await selects.count()
  const result: string[][] = []
  for (let i = 0; i < count; i++) {
    result.push(await selects.nth(i).locator('option').allTextContents())
  }
  return result
}

test.describe('Focus sidebar sections offer the radar column filters', () => {
  let app: ElectronApplication
  let page: Page
  let tempRoot: string

  test.beforeAll(async () => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ledger-sidebar-filters-'))
    const repoPath = path.join(tempRoot, 'repo-one')
    createRepo(repoPath)

    const settingsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ledger-tests-'))
    const settingsPath = path.join(settingsDir, 'ledger-settings.json')

    app = await electron.launch({
      args: [path.join(__dirname, '../out/main/main.js'), `--repo=${repoPath}`],
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

  test('branches section exposes the same filter and sort options as the radar column', async () => {
    // Radar column options
    const radarOptions = await radarColumnOptions(page, '.branch-list-panel.local')
    expect(radarOptions.length).toBeGreaterThanOrEqual(2)
    const [radarFilter, radarSort] = radarOptions
    expect(radarFilter).toEqual(['All', 'Local Only', 'Unmerged'])
    expect(radarSort).toEqual(['Name', 'Last Commit', 'First Commit', 'Most Commits'])

    // Sidebar section options
    await page.getByTestId('view-toggle-focus').click()
    await expect(page.getByTestId('canvas-layout-focus')).toBeVisible()

    const branches = page.getByTestId('sidebar-section-branches')
    await branches.locator('.section-filter-btn').click()
    const selects = branches.locator('.section-filter-panel .section-filter-select')
    await expect(selects).toHaveCount(2)
    expect(await selects.nth(0).locator('option').allTextContents()).toEqual(radarFilter)
    expect(await selects.nth(1).locator('option').allTextContents()).toEqual(radarSort)
  })

  test('sidebar filter and sort actually apply', async () => {
    const branches = page.getByTestId('sidebar-section-branches')
    const selects = branches.locator('.section-filter-panel .section-filter-select')

    // Sort by name: apple-branch before zebra-branch
    await selects.nth(1).selectOption('name')
    const names = () => branches.locator('.sidebar-item .item-title').allTextContents()
    const sorted = await names()
    expect(sorted.indexOf('apple-branch')).toBeLessThan(sorted.indexOf('zebra-branch'))

    // Filter to local-only: main is tracked-less here too, so use search to prove filtering
    await branches.locator('.section-filter-input').fill('apple')
    await expect(branches.getByText('zebra-branch')).toHaveCount(0)
    await expect(branches.getByText('apple-branch')).toBeVisible()
    await branches.locator('.section-filter-input').fill('')
  })

  test('sort and filter persist across canvas switches and are shared with the radar column', async () => {
    const branches = page.getByTestId('sidebar-section-branches')
    const sortSelect = branches.locator('.section-filter-panel .section-filter-select').nth(1)
    await sortSelect.selectOption('last-commit')
    // The panel must survive the re-render triggered by the change
    await expect(sortSelect).toHaveValue('last-commit')

    await page.getByTestId('view-toggle-radar').click()
    const radarPanel = page.locator('.branch-list-panel.local')
    if ((await radarPanel.locator('.column-controls').count()) === 0) {
      await radarPanel.locator('.header-filter-btn').first().click()
    }
    await expect(radarPanel.locator('.column-controls .control-select').nth(1)).toHaveValue('last-commit')

    await page.getByTestId('view-toggle-focus').click()
    await expect(page.getByTestId('sidebar-section-branches').locator('.section-filter-select').nth(1)).toHaveValue(
      'last-commit'
    )

    // Restore the default so the persisted preference doesn't leak into other runs
    await page.getByTestId('sidebar-section-branches').locator('.section-filter-select').nth(1).selectOption('name')
  })

  test('titlebar back/forward buttons walk the editor history', async () => {
    const branches = page.getByTestId('sidebar-section-branches')
    await branches.locator('.sidebar-item', { hasText: 'apple-branch' }).click()
    await expect(page.locator('.detail-title')).toHaveText('apple-branch')
    await branches.locator('.sidebar-item', { hasText: 'zebra-branch' }).click()
    await expect(page.locator('.detail-title')).toHaveText('zebra-branch')

    await page.getByTestId('nav-back').click()
    await expect(page.locator('.detail-title')).toHaveText('apple-branch')
    await expect(page.getByTestId('nav-forward')).toBeEnabled()

    await page.getByTestId('nav-forward').click()
    await expect(page.locator('.detail-title')).toHaveText('zebra-branch')
    await expect(page.getByTestId('nav-forward')).toBeDisabled()
  })

  test('every filterable section has filter and sort controls', async () => {
    const expectations: Array<[string, number]> = [
      ['sidebar-section-prs', 2],
      ['sidebar-section-branches', 2],
      ['sidebar-section-remotes', 2],
      ['sidebar-section-worktrees', 2],
      ['sidebar-section-stashes', 2],
      ['sidebar-section-repos', 1], // repos have no filter dimension, sort only
    ]

    for (const [testId, expected] of expectations) {
      const section = page.getByTestId(testId)
      const panel = section.locator('.section-filter-panel')
      if ((await panel.count()) === 0) {
        await section.locator('.section-filter-btn').click()
      }
      await expect(section.locator('.section-filter-panel .section-filter-select')).toHaveCount(
        expected
      )
    }
  })
})
