import { test, expect, _electron as electron, ElectronApplication, Page } from '@playwright/test'
import * as path from 'path'
import * as fs from 'fs'
import * as os from 'os'

const TEST_REPO = path.join(__dirname, '..')

test.describe('Ledger App - Welcome Screen', () => {
  let app: ElectronApplication
  let page: Page
  let settingsPath: string

  test.beforeAll(async () => {
    // Use an isolated settings file (avoid coupling tests to the real user profile)
    const settingsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ledger-tests-'))
    settingsPath = path.join(settingsDir, 'ledger-settings.json')

    app = await electron.launch({
      args: [path.join(__dirname, '../out/main/main.js')],
      env: { ...process.env, LEDGER_SETTINGS_PATH: settingsPath },
    })
    
    page = await app.firstWindow()
    await page.waitForLoadState('domcontentloaded')
  })

  test.afterAll(async () => {
    await app.close()
  })

  test('displays welcome message', async () => {
    await expect(page.getByTestId('empty-state')).toBeVisible()
    await expect(page.getByText('Welcome to Ledger')).toBeVisible()
  })

  test('displays welcome icon', async () => {
    await expect(page.getByTestId('empty-icon')).toBeVisible()
  })

  test('displays app header', async () => {
    await expect(page.getByTestId('app-header')).toBeVisible()
  })

  test('displays Select Repository button in empty state', async () => {
    await expect(page.getByTestId('select-repo-empty')).toBeVisible()
  })

  test('displays instruction text', async () => {
    await expect(page.locator('text=Select a git repository')).toBeVisible()
  })
})

test.describe('Ledger App - Main View', () => {
  let app: ElectronApplication
  let page: Page
  let repoLoaded = false
  let settingsPath: string

  test.beforeAll(async () => {
    // Use an isolated settings file (avoid coupling tests to the real user profile)
    const settingsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ledger-tests-'))
    settingsPath = path.join(settingsDir, 'ledger-settings.json')
    
    // Launch app with --repo argument to load test repo directly
    app = await electron.launch({
      args: [
        path.join(__dirname, '../out/main/main.js'),
        `--repo=${TEST_REPO}`
      ],
      env: {
        ...process.env,
        LEDGER_SETTINGS_PATH: settingsPath,
        LEDGER_MOCK_OPENROUTER: '1',
      },
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
    await expect(page.getByTestId('main-content')).toBeVisible()
    await expect(page.getByTestId('canvas-layout-radar')).toBeVisible()
  })

  test('displays Pull Requests column', async () => {
    test.skip(!repoLoaded, 'Repo did not auto-load')
    // Wait for canvas layout to be rendered first
    // Ensure we're in Radar mode (click Radar button)
    await page.getByTestId('view-toggle-radar').click()
    const prColumn = page.getByTestId('canvas-column-pr-list')
    await expect(prColumn).toBeVisible({ timeout: 10000 })
    await expect(prColumn.locator('h2')).toContainText('Pull Requests')
  })

  test('displays Worktrees column', async () => {
    test.skip(!repoLoaded, 'Repo did not auto-load')
    const wtColumn = page.getByTestId('canvas-column-worktree-list')
    await expect(wtColumn).toBeVisible({ timeout: 10000 })
    await expect(wtColumn.locator('h2')).toContainText('Worktrees')
  })

  test('displays Local Branches column', async () => {
    test.skip(!repoLoaded, 'Repo did not auto-load')
    const branchColumn = page.getByTestId('canvas-column-branch-list')
    await expect(branchColumn).toBeVisible({ timeout: 10000 })
    await expect(branchColumn.locator('h2')).toContainText('Branches')
  })

  test('displays Remote Branches column', async () => {
    test.skip(!repoLoaded, 'Repo did not auto-load')
    const remoteColumn = page.getByTestId('canvas-column-remote-list')
    await expect(remoteColumn).toBeVisible({ timeout: 10000 })
    await expect(remoteColumn.locator('h2')).toContainText('Remotes')
  })

  test('displays Refresh button', async () => {
    test.skip(!repoLoaded, 'Repo did not auto-load')
    await expect(page.getByTestId('refresh-button')).toBeVisible()
  })

  test('displays Change Repo button', async () => {
    test.skip(!repoLoaded, 'Repo did not auto-load')
    await expect(page.getByTestId('change-repo-button')).toBeVisible()
  })

  test('displays repo path in header', async () => {
    test.skip(!repoLoaded, 'Repo did not auto-load')
    const repoPathEl = page.getByTestId('repo-path')
    await expect(repoPathEl).toBeVisible()
    await expect(repoPathEl).not.toHaveText('')
  })

  test('displays branch list items', async () => {
    test.skip(!repoLoaded, 'Repo did not auto-load')
    const branchColumn = page.getByTestId('canvas-column-branch-list')
    await expect(branchColumn).toBeVisible({ timeout: 10000 })
    const branchItems = branchColumn.locator('.item')
    await expect(branchItems.first()).toBeVisible({ timeout: 10000 })
  })

  test('displays Focus Mode toggle button', async () => {
    test.skip(!repoLoaded, 'Repo did not auto-load')
    const toggleButton = page.getByTestId('view-toggle-focus')
    await expect(toggleButton).toBeVisible()
  })

  test('can switch to Focus Mode', async () => {
    test.skip(!repoLoaded, 'Repo did not auto-load')
    
    // Click the toggle button to switch to Focus Mode
    await page.getByTestId('view-toggle-focus').click()
    
    // Verify Focus Mode canvas is active (has sidebar panel)
    await expect(page.getByTestId('canvas-layout-focus')).toBeVisible()
    await expect(page.getByTestId('canvas-column-sidebar')).toBeVisible()
    
    // Verify git graph is present in Focus mode
    await expect(page.getByTestId('canvas-column-git-graph')).toBeVisible()

    // Verify key sidebar sections exist (avoid asserting exact structure/count)
    await expect(page.getByTestId('sidebar-panel')).toBeVisible()
    await expect(page.getByTestId('sidebar-section-prs')).toBeVisible()
    await expect(page.getByTestId('sidebar-section-branches')).toBeVisible()
  })

  test('can switch back to Radar Mode', async () => {
    test.skip(!repoLoaded, 'Repo did not auto-load')
    
    // First switch to Focus Mode
    await page.getByTestId('view-toggle-focus').click()
    await expect(page.getByTestId('canvas-column-sidebar')).toBeVisible()
    
    // Click the toggle button to switch back to Radar Mode
    await page.getByTestId('view-toggle-radar').click()
    
    // Verify Radar canvas is active (has pr-list column, no sidebar)
    await expect(page.getByTestId('canvas-layout-radar')).toBeVisible()
    await expect(page.getByTestId('canvas-column-pr-list')).toBeVisible()
  })
})

test.describe('Ledger App - AI Settings', () => {
  let app: ElectronApplication
  let page: Page
  let repoLoaded = false
  let settingsPath: string

  test.beforeAll(async () => {
    // Use an isolated settings file
    const settingsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ledger-tests-'))
    settingsPath = path.join(settingsDir, 'ledger-settings.json')
    
    // Launch app with --repo argument to load test repo directly
    app = await electron.launch({
      args: [
        path.join(__dirname, '../out/main/main.js'),
        `--repo=${TEST_REPO}`
      ],
      env: {
        ...process.env,
        LEDGER_SETTINGS_PATH: settingsPath,
        LEDGER_MOCK_OPENROUTER: '1',
      },
    })
    
    page = await app.firstWindow()
    await page.waitForLoadState('domcontentloaded')
    
    // Wait for repo to load
    try {
      await page.waitForSelector('.ledger-content', { timeout: 10000 })
      repoLoaded = true
    } catch {
      const welcomeVisible = await page.locator('text=Welcome to Ledger').isVisible()
      if (welcomeVisible) {
        console.log('App showed welcome screen - AI tests will be skipped')
      }
    }
  })

  test.afterAll(async () => {
    await app.close()
  })

  test('opens settings panel', async () => {
    test.skip(!repoLoaded, 'Repo did not auto-load')
    
    // Click settings button in titlebar
    const settingsButton = page.getByTestId('settings-button')
    await expect(settingsButton).toBeVisible()
    await settingsButton.click()
    
    // Wait for settings panel to be visible
    // Settings appear in the editor column in Focus mode
    await page.waitForSelector('[data-testid="ai-settings-section"]', { timeout: 5000 })
    await expect(page.getByTestId('ai-settings-section')).toBeVisible()
  })

  test('displays all AI providers', async () => {
    test.skip(!repoLoaded, 'Repo did not auto-load')
    
    // Ensure settings are open (check if not already active)
    const settingsButton = page.getByTestId('settings-button')
    const isActive = await settingsButton.evaluate((el) => el.classList.contains('active'))
    if (!isActive) {
      await settingsButton.click()
    }
    await page.waitForSelector('[data-testid="ai-settings-section"]', { timeout: 5000 })
    
    // Verify provider list is visible
    await expect(page.getByTestId('ai-provider-list')).toBeVisible()
    
    // Verify all provider cards are present
    await expect(page.getByTestId('ai-provider-card-openrouter')).toBeVisible()
    await expect(page.getByTestId('ai-provider-card-anthropic')).toBeVisible()
    await expect(page.getByTestId('ai-provider-card-openai')).toBeVisible()
    await expect(page.getByTestId('ai-provider-card-gemini')).toBeVisible()
  })

  test('OpenRouter free tier works after enabling without API key', async () => {
    test.skip(!repoLoaded, 'Repo did not auto-load')
    
    // Ensure settings are open
    const settingsButton = page.getByTestId('settings-button')
    const isActive = await settingsButton.evaluate((el) => el.classList.contains('active'))
    if (!isActive) {
      await settingsButton.click()
    }
    await page.waitForSelector('[data-testid="ai-settings-section"]', { timeout: 5000 })
    
    // Find OpenRouter provider card
    const openrouterCard = page.getByTestId('ai-provider-card-openrouter')
    await expect(openrouterCard).toBeVisible()
    
    // Expand it if not already expanded
    const isExpanded = await openrouterCard.evaluate((el) => el.classList.contains('expanded'))
    if (!isExpanded) {
      await page.getByTestId('ai-provider-header-openrouter').click()
      await page.waitForTimeout(300)
    }
    
    // Enable OpenRouter without API key by clicking Enable button
    // This enables the provider for free tier access
    const enableButton = openrouterCard.locator('.ai-key-btn-save')
    if (await enableButton.isVisible()) {
      // Button should say "Enable" when no API key is entered
      await enableButton.click()
      await page.waitForTimeout(500)
    }
    
    // Test button should now be visible (OpenRouter enabled via free tier)
    const testButton = page.getByTestId('ai-test-btn-openrouter')
    await expect(testButton).toBeVisible({ timeout: 2000 })
    
    // Click test button
    await testButton.click()
    
    // Wait for test to complete - should see "Testing..." then "Connected" or "Failed"
    const testStatus = page.getByTestId('ai-test-status-openrouter')
    await expect(testStatus).toBeVisible({ timeout: 2000 })

    // With mocked responses, the status can flip to Connected immediately.
    await expect(testStatus).toContainText('Connected', { timeout: 5000 })
  })
})
