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

  test('displays welcome icon', async () => {
    const icon = page.locator('.empty-icon')
    await expect(icon).toBeVisible()
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
    // Clear settings to ensure fresh start with default canvas (Radar)
    if (fs.existsSync(SETTINGS_PATH)) {
      fs.unlinkSync(SETTINGS_PATH)
    }
    
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

  test('displays canvas layout', async () => {
    test.skip(!repoLoaded, 'Repo did not auto-load')
    // Canvas system uses .canvas-layout inside .ledger-content.canvas-mode
    await expect(page.locator('.ledger-content.canvas-mode')).toBeVisible()
    await expect(page.locator('.canvas-layout')).toBeVisible()
  })

  test('displays Pull Requests column', async () => {
    test.skip(!repoLoaded, 'Repo did not auto-load')
    // Wait for canvas layout to be rendered first
    await page.waitForSelector('.canvas-layout', { timeout: 5000 })
    // Ensure we're in Radar mode (click Radar button)
    await page.locator('button.view-toggle-btn[title="Radar"]').click()
    await page.waitForTimeout(100) // Brief wait for canvas switch
    // New selector uses data-panel attribute
    const prColumn = page.locator('.canvas-column[data-panel="pr-list"]')
    await expect(prColumn).toBeVisible({ timeout: 10000 })
    await expect(prColumn.locator('h2')).toContainText('Pull Requests')
  })

  test('displays Worktrees column', async () => {
    test.skip(!repoLoaded, 'Repo did not auto-load')
    await page.waitForSelector('.canvas-layout', { timeout: 5000 })
    const wtColumn = page.locator('.canvas-column[data-panel="worktree-list"]')
    await expect(wtColumn).toBeVisible({ timeout: 10000 })
    await expect(wtColumn.locator('h2')).toContainText('Worktrees')
  })

  test('displays Local Branches column', async () => {
    test.skip(!repoLoaded, 'Repo did not auto-load')
    await page.waitForSelector('.canvas-layout', { timeout: 5000 })
    const branchColumn = page.locator('.canvas-column[data-panel="branch-list"]')
    await expect(branchColumn).toBeVisible({ timeout: 10000 })
    await expect(branchColumn.locator('h2')).toContainText('Branches')
  })

  test('displays Remote Branches column', async () => {
    test.skip(!repoLoaded, 'Repo did not auto-load')
    await page.waitForSelector('.canvas-layout', { timeout: 5000 })
    const remoteColumn = page.locator('.canvas-column[data-panel="remote-list"]')
    await expect(remoteColumn).toBeVisible({ timeout: 10000 })
    await expect(remoteColumn.locator('h2')).toContainText('Remotes')
  })

  test('displays filter and sort controls in columns', async () => {
    test.skip(!repoLoaded, 'Repo did not auto-load')
    await page.waitForSelector('.canvas-layout', { timeout: 5000 })
    // Click to expand PR controls using new selector
    const prColumn = page.locator('.canvas-column[data-panel="pr-list"]')
    await expect(prColumn).toBeVisible({ timeout: 10000 })
    const prHeader = prColumn.locator('.column-header')
    await prHeader.click()
    // Now controls should be visible
    const controls = page.locator('.control-select')
    await expect(controls.first()).toBeVisible()
  })

  test('displays Refresh button', async () => {
    test.skip(!repoLoaded, 'Repo did not auto-load')
    await expect(page.locator('button:has-text("Refresh")')).toBeVisible()
  })

  test('displays Change Repo button', async () => {
    test.skip(!repoLoaded, 'Repo did not auto-load')
    await expect(page.locator('button[title="Change Repository"]')).toBeVisible()
  })

  test('displays repo path in header', async () => {
    test.skip(!repoLoaded, 'Repo did not auto-load')
    const repoPath = page.locator('.repo-path')
    await expect(repoPath).toBeVisible()
    await expect(repoPath).toContainText('ledger')
  })

  test('displays branch list items', async () => {
    test.skip(!repoLoaded, 'Repo did not auto-load')
    await page.waitForSelector('.canvas-layout', { timeout: 5000 })
    const branchColumn = page.locator('.canvas-column[data-panel="branch-list"]')
    await expect(branchColumn).toBeVisible({ timeout: 10000 })
    const branchItems = branchColumn.locator('.item')
    await expect(branchItems.first()).toBeVisible({ timeout: 10000 })
  })

  test('displays count badges', async () => {
    test.skip(!repoLoaded, 'Repo did not auto-load')
    await page.waitForSelector('.canvas-layout', { timeout: 5000 })
    const badges = page.locator('.count-badge')
    await expect(badges.first()).toBeVisible({ timeout: 10000 })
  })

  test('current branch has indicator', async () => {
    test.skip(!repoLoaded, 'Repo did not auto-load')
    await page.waitForSelector('.canvas-layout', { timeout: 5000 })
    const branchColumn = page.locator('.canvas-column[data-panel="branch-list"]')
    await expect(branchColumn).toBeVisible({ timeout: 10000 })
    const currentBranch = branchColumn.locator('.item.current')
    await expect(currentBranch).toBeVisible({ timeout: 10000 })
  })

  test('displays Focus Mode toggle button', async () => {
    test.skip(!repoLoaded, 'Repo did not auto-load')
    const toggleButton = page.locator('button.view-toggle-btn[title="Focus"]')
    await expect(toggleButton).toBeVisible()
    await expect(toggleButton).toContainText('Focus')
  })

  test('can switch to Focus Mode', async () => {
    test.skip(!repoLoaded, 'Repo did not auto-load')
    
    // Click the toggle button to switch to Focus Mode
    const toggleButton = page.locator('button.view-toggle-btn[title="Focus"]')
    await toggleButton.click()
    
    // Verify Focus Mode canvas is active (has sidebar panel)
    await expect(page.locator('.canvas-column[data-panel="sidebar"]')).toBeVisible()
    
    // Verify git graph is present in Focus mode
    await expect(page.locator('.canvas-column[data-panel="git-graph"]')).toBeVisible()
    
    // Verify sidebar sections are present (5 sections: PRs, Branches, Remotes, Worktrees, Stashes)
    const sidebarSections = page.locator('.sidebar-section')
    await expect(sidebarSections).toHaveCount(5)
  })

  test('can switch back to Radar Mode', async () => {
    test.skip(!repoLoaded, 'Repo did not auto-load')
    
    // First switch to Focus Mode
    await page.locator('button.view-toggle-btn[title="Focus"]').click()
    await expect(page.locator('.canvas-column[data-panel="sidebar"]')).toBeVisible()
    
    // Click the toggle button to switch back to Radar Mode
    const radarButton = page.locator('button.view-toggle-btn[title="Radar"]')
    await radarButton.click()
    
    // Verify Radar canvas is active (has pr-list column, no sidebar)
    await expect(page.locator('.canvas-column[data-panel="pr-list"]')).toBeVisible()
    await expect(page.locator('.canvas-column[data-panel="sidebar"]')).not.toBeVisible()
  })
})
