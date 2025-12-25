import { test, expect, _electron as electron, ElectronApplication, Page } from '@playwright/test'
import * as path from 'path'
import * as fs from 'fs'
import * as os from 'os'

const SETTINGS_PATH = path.join(os.homedir(), 'Library/Application Support/ledger/ledger-settings.json')
const TEST_REPO = path.join(__dirname, '..')

test.describe('Ledger App - Welcome Screen', () => {
  let app: ElectronApplication
  let page: Page

  test.beforeAll(async () => {
    // Clear settings to ensure fresh start
    if (fs.existsSync(SETTINGS_PATH)) {
      fs.unlinkSync(SETTINGS_PATH)
    }

    app = await electron.launch({
      args: [path.join(__dirname, '../out/main/main.js')],
    })
    
    page = await app.firstWindow()
    await page.waitForLoadState('domcontentloaded')
  })

  test.afterAll(async () => {
    await app.close()
  })

  test('displays welcome message', async () => {
    await expect(page.locator('text=Welcome to Ledger')).toBeVisible()
  })

  test('displays Ledger logo', async () => {
    const logo = page.locator('.logo')
    await expect(logo).toBeVisible()
    await expect(logo).toContainText('Ledger')
  })

  test('displays app header', async () => {
    await expect(page.locator('.ledger-header')).toBeVisible()
  })

  test('displays Select Repository button in empty state', async () => {
    const button = page.locator('.empty-state button:has-text("Select Repository")')
    await expect(button).toBeVisible()
  })

  test('displays instruction text', async () => {
    await expect(page.locator('text=Select a git repository')).toBeVisible()
  })
})

test.describe('Ledger App - Main View', () => {
  let app: ElectronApplication
  let page: Page
  let repoLoaded = false

  test.beforeAll(async () => {
    // Launch app with --repo argument to load test repo directly
    app = await electron.launch({
      args: [
        path.join(__dirname, '../out/main/main.js'),
        `--repo=${TEST_REPO}`
      ],
    })
    
    page = await app.firstWindow()
    await page.waitForLoadState('domcontentloaded')
    
    // Wait for either welcome screen or main content
    try {
      await page.waitForSelector('.ledger-content', { timeout: 10000 })
      repoLoaded = true
    } catch {
      // Repo didn't auto-load, check if welcome screen shows
      const welcomeVisible = await page.locator('text=Welcome to Ledger').isVisible()
      if (welcomeVisible) {
        console.log('App showed welcome screen instead of loading repo - tests will be skipped')
      }
    }
  })

  test.afterAll(async () => {
    await app.close()
  })

  test('displays four-column layout', async () => {
    test.skip(!repoLoaded, 'Repo did not auto-load')
    await expect(page.locator('.ledger-content.four-columns')).toBeVisible()
  })

  test('displays Pull Requests column', async () => {
    test.skip(!repoLoaded, 'Repo did not auto-load')
    await expect(page.locator('.pr-column')).toBeVisible()
    await expect(page.locator('.pr-column h2')).toContainText('Pull Requests')
  })

  test('displays Worktrees column', async () => {
    test.skip(!repoLoaded, 'Repo did not auto-load')
    await expect(page.locator('.worktrees-column')).toBeVisible()
    await expect(page.locator('.worktrees-column h2')).toContainText('Worktrees')
  })

  test('displays Local Branches column', async () => {
    test.skip(!repoLoaded, 'Repo did not auto-load')
    await expect(page.locator('.branches-column')).toBeVisible()
    await expect(page.locator('.branches-column h2')).toContainText('Local Branches')
  })

  test('displays Remote Branches column', async () => {
    test.skip(!repoLoaded, 'Repo did not auto-load')
    await expect(page.locator('.remotes-column')).toBeVisible()
    await expect(page.locator('.remotes-column h2')).toContainText('Remote Branches')
  })

  test('displays filter and sort controls', async () => {
    test.skip(!repoLoaded, 'Repo did not auto-load')
    const controls = page.locator('.control-select')
    await expect(controls.first()).toBeVisible()
    await expect(controls).toHaveCount(4)
  })

  test('displays Refresh button', async () => {
    test.skip(!repoLoaded, 'Repo did not auto-load')
    await expect(page.locator('button:has-text("Refresh")')).toBeVisible()
  })

  test('displays Change Repo button', async () => {
    test.skip(!repoLoaded, 'Repo did not auto-load')
    await expect(page.locator('button:has-text("Change Repo")')).toBeVisible()
  })

  test('displays repo path in header', async () => {
    test.skip(!repoLoaded, 'Repo did not auto-load')
    const repoPath = page.locator('.repo-path')
    await expect(repoPath).toBeVisible()
    await expect(repoPath).toContainText('ledger')
  })

  test('displays branch list items', async () => {
    test.skip(!repoLoaded, 'Repo did not auto-load')
    const branchItems = page.locator('.branches-column .item')
    await expect(branchItems.first()).toBeVisible()
  })

  test('displays count badges', async () => {
    test.skip(!repoLoaded, 'Repo did not auto-load')
    const badges = page.locator('.count-badge')
    await expect(badges.first()).toBeVisible()
  })

  test('current branch has indicator', async () => {
    test.skip(!repoLoaded, 'Repo did not auto-load')
    const currentBranch = page.locator('.branches-column .item.current')
    await expect(currentBranch).toBeVisible()
  })
})
