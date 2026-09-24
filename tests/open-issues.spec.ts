import { test, expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test'
import { execFileSync } from 'child_process'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { electronTestEnv } from './electron-test-env'

let app: ElectronApplication
let page: Page
let root: string
let repo: string
const original = 'first\nconst color = "red";\nconst size = "small";\nlast\n'
const changed = 'first\nconst color = "blue";\nconst size = "large";\nlast\n'
const git = (...args: string[]) => execFileSync('git', args, { cwd: repo, encoding: 'utf8' }).trim()

test.beforeEach(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'ledger-issues-'))
  repo = path.join(root, 'repo')
  fs.mkdirSync(repo)
  git('init', '-b', 'main')
  git('config', 'user.name', 'Ledger Test')
  git('config', 'user.email', 'test@example.com')
  fs.writeFileSync(path.join(repo, 'example.ts'), original)
  git('add', '.')
  git('commit', '-m', 'Initial fixture')
  git('branch', 'aaa-feature')
  git('worktree', 'add', '-b', 'worktree-feature', path.join(root, 'linked'))
  git('checkout', '-b', 'zzz-current')
  fs.writeFileSync(path.join(repo, 'history.txt'), 'history\n')
  git('add', '.')
  git('commit', '-m', 'Second fixture')
  fs.writeFileSync(path.join(repo, 'example.ts'), changed)
  app = await electron.launch({
    args: [path.join(__dirname, '../out/main/main.js'), `--repo=${repo}`],
    env: electronTestEnv({ LEDGER_SETTINGS_PATH: path.join(root, 'settings.json') }),
  })
  page = await app.firstWindow()
  await expect(page.getByTestId('main-content')).toBeVisible({ timeout: 15000 })
})

test.afterEach(async () => {
  if (app) await app.close()
  fs.rmSync(root, { recursive: true, force: true })
})

async function openStaging() {
  await page.locator('.commit-item.uncommitted').dblclick()
  await page.locator('.staging-file-item').filter({ hasText: 'example.ts' }).first().click()
  await expect(page.locator('.staging-diff-line')).not.toHaveCount(0)
}

test('#71 current branch and main precede alphabetical branches in both lists', async () => {
  await expect(page.locator('.branch-list-panel.local .item-name')).toHaveCount(4)
  const names = await page.locator('.branch-list-panel.local .item-name').allTextContents()
  expect(names.map((n) => n.replace('→', '').trim()).slice(0, 2)).toEqual(['zzz-current', 'main'])
  await page.getByTestId('view-toggle-focus').click()
  const sidebar = page.getByTestId('sidebar-section-branches')
  await expect(sidebar.locator('.sidebar-item .item-title')).toHaveCount(5)
  const titles = await sidebar.locator('.sidebar-item .item-title').allTextContents()
  expect(titles.filter((n) => n !== 'Uncommitted changes').slice(0, 2)).toEqual(['zzz-current', 'main'])
})

test('#72 branch status links to its checked-out worktree', async () => {
  await page.locator('.branch-list-panel.local .branch-item').filter({ hasText: 'worktree-feature' }).dblclick()
  const link = page.getByRole('button', { name: 'Worktree: linked', exact: true })
  await expect(link).toBeVisible()
  await expect(page.locator('.detail-meta-grid')).not.toContainText('Not checked out')
  await link.click()
  await expect(page.locator('.detail-type-badge')).toHaveText('Worktree')
  await expect(page.locator('.sidebar-detail-panel')).toContainText(path.join(root, 'linked'))
})

test('#70 Command-F searches old and new diff content', async () => {
  await openStaging()
  await page.locator('.staging-diff-line').first().click()
  await page.keyboard.press('Meta+f')
  const search = page.getByRole('textbox', { name: 'Find in diff' })
  await expect(search).toBeVisible()
  await search.fill('red')
  await expect.poll(async () => (await page.locator('.diff-search-match').allTextContents()).join('')).toBe('red')
  await expect(page.locator('.diff-search-bar')).toContainText('1 of 1')
  await search.fill('blue')
  await expect.poll(async () => (await page.locator('.diff-search-match').allTextContents()).join('')).toBe('blue')
  await expect(page.locator('.diff-search-bar')).toContainText('1 of 1')
  await search.fill('const')
  await expect(page.locator('.diff-search-bar')).toContainText('1 of 4')
  await search.press('Enter')
  await expect(page.locator('.diff-search-bar')).toContainText('2 of 4')
  await search.press('Shift+Enter')
  await expect(page.locator('.diff-search-bar')).toContainText('1 of 4')
  await search.press('Escape')
  await expect(search).not.toBeVisible()
})

test('#69 marks the changed characters in a replacement line', async () => {
  await openStaging()
  await expect(
    page.locator('.diff-line-delete').filter({ hasText: 'color' }).locator('.diff-inline-change')
  ).toHaveText(['r', 'd'])
  await expect(page.locator('.diff-line-add').filter({ hasText: 'color' }).locator('.diff-inline-change')).toHaveText([
    'blu',
  ])
  await page.screenshot({ path: test.info().outputPath('inline-diff.png') })
})

test('#68 discards only a selected replacement, preserving its neighbor', async () => {
  await openStaging()
  await page.locator('.staging-diff-line.diff-line-delete').filter({ hasText: 'color' }).click()
  await page.locator('.staging-diff-line.diff-line-add').filter({ hasText: 'color' }).click()
  await page.getByRole('button', { name: 'Discard Selected', exact: true }).click()
  await page.getByRole('button', { name: 'Confirm Discard?', exact: true }).click()
  await expect.poll(() => fs.readFileSync(path.join(repo, 'example.ts'), 'utf8')).toBe(changed.replace('blue', 'red'))
  expect(git('diff', '--cached')).toBe('')
})

test('#68 stages then unstages just the selected replacement', async () => {
  await openStaging()
  await page.locator('.staging-diff-line.diff-line-delete').filter({ hasText: 'color' }).click()
  await page.locator('.staging-diff-line.diff-line-add').filter({ hasText: 'color' }).click()
  await page.getByRole('button', { name: 'Stage Selected', exact: true }).click()
  await expect.poll(() => git('show', ':example.ts')).toBe(original.replace('red', 'blue').trim())
  // Use the same public API as the staged line action; verify the index and worktree independently.
  const result = await page.evaluate(async () => {
    const diff = await window.conveyor.staging.getFileDiff('example.ts', true)
    const indices = diff!.hunks[0].lines.filter((l) => l.type === 'add' || l.type === 'delete').map((l) => l.lineIndex)
    return window.electronAPI.unstageLines('example.ts', 0, indices)
  })
  expect(result.success, result.message).toBe(true)
  expect(git('diff', '--cached')).toBe('')
  expect(fs.readFileSync(path.join(repo, 'example.ts'), 'utf8')).toBe(changed)
})

test('#24 double-clicking a historical commit opens details without changing git state', async () => {
  const before = { head: git('rev-parse', 'HEAD'), status: git('status', '--porcelain'), stashes: git('stash', 'list') }
  await page.locator('.commit-item').filter({ hasText: 'Initial fixture' }).locator('.commit-hash').dblclick()
  await expect(page.getByTestId('canvas-layout-focus')).toBeVisible()
  await expect(page.locator('.diff-panel')).toBeVisible()
  expect({
    head: git('rev-parse', 'HEAD'),
    status: git('status', '--porcelain'),
    stashes: git('stash', 'list'),
  }).toEqual(before)
  expect(fs.readFileSync(path.join(repo, 'example.ts'), 'utf8')).toBe(changed)
})

test('#68 unstages a selected replacement while retaining the neighboring staged change', async () => {
  const result = await page.evaluate(async () => {
    await window.conveyor.staging.stageFile('example.ts')
    const diff = await window.conveyor.staging.getFileDiff('example.ts', true)
    const indices = diff!.hunks[0].lines.filter((l) => l.content.includes('color')).map((l) => l.lineIndex)
    return window.electronAPI.unstageLines('example.ts', 0, indices)
  })
  expect(result.success, result.message).toBe(true)
  expect(git('show', ':example.ts')).toBe(changed.replace('blue', 'red').trim())
  expect(fs.readFileSync(path.join(repo, 'example.ts'), 'utf8')).toBe(changed)
})

test('#70 search also works in a read-only commit diff', async () => {
  await page.locator('.commit-item').filter({ hasText: 'Initial fixture' }).dblclick()
  const panel = page.locator('.diff-panel')
  await expect(panel).toBeVisible()
  if (!(await panel.locator('.diff-line-content').count())) {
    await panel.locator('.diff-file-header').first().click()
  }
  await panel.locator('.diff-line-content').first().click()
  await page.keyboard.press('Meta+f')
  const search = panel.getByRole('textbox', { name: 'Find in diff' })
  await search.fill('const')
  await expect(panel.locator('.diff-search-bar')).toContainText('1 of 2')
  await search.press('Enter')
  await expect(panel.locator('.diff-search-bar')).toContainText('2 of 2')
  await search.fill('"')
  await expect(panel.locator('.diff-search-bar')).toContainText('1 of 4')
  await search.fill('[')
  await expect(panel.locator('.diff-search-bar')).toContainText('No matches')
})

test('line actions preserve a missing trailing newline', async () => {
  const file = path.join(repo, 'no-newline.txt')
  const before = 'first\nold last'
  const after = 'first\nnew last'
  fs.writeFileSync(file, before)
  git('add', 'no-newline.txt')
  git('commit', '-m', 'Fixture without final newline')
  fs.writeFileSync(file, after)
  const operate = (action: 'stageLines' | 'unstageLines' | 'discardLines', staged: boolean) =>
    page.evaluate(
      async ({ action, staged }) => {
        const diff = await window.conveyor.staging.getFileDiff('no-newline.txt', staged)
        const selected = diff!.hunks[0].lines.filter((l) => l.type !== 'context').map((l) => l.lineIndex)
        return window.electronAPI[action]('no-newline.txt', 0, selected)
      },
      { action, staged }
    )
  const staged = await operate('stageLines', false)
  expect(staged.success, staged.message).toBe(true)
  expect(execFileSync('git', ['show', ':no-newline.txt'], { cwd: repo, encoding: 'utf8' })).toBe(after)
  const unstaged = await operate('unstageLines', true)
  expect(unstaged.success, unstaged.message).toBe(true)
  expect(execFileSync('git', ['show', ':no-newline.txt'], { cwd: repo, encoding: 'utf8' })).toBe(before)
  const discarded = await operate('discardLines', false)
  expect(discarded.success, discarded.message).toBe(true)
  expect(fs.readFileSync(file, 'utf8')).toBe(before)
})

test('line selection across two hunks preserves neighboring changes', async () => {
  const gap = Array.from({ length: 12 }, (_, i) => `context ${i}\n`).join('')
  const before = `first red\nneighbor old\n${gap}last red\nneighbor old\nend\n`
  const after = `first blue\nneighbor new\n${gap}last blue\nneighbor new\nend\n`
  fs.writeFileSync(path.join(repo, 'example.ts'), before)
  git('add', 'example.ts')
  git('commit', '-m', 'Two hunk fixture')
  fs.writeFileSync(path.join(repo, 'example.ts'), after)
  await page.getByTestId('refresh-button').click()
  await openStaging()
  await expect(page.locator('.staging-hunk')).toHaveCount(2)
  const selectLines = async (words: RegExp) => {
    const lines = page.locator('.staging-diff-line.selectable').filter({ hasText: words })
    await expect(lines).toHaveCount(4)
    for (const line of await lines.all()) await line.click()
  }
  await selectLines(/first|last/)
  await page.getByRole('button', { name: 'Stage Selected', exact: true }).click()
  const selected = `first blue\nneighbor old\n${gap}last blue\nneighbor old\nend\n`
  await expect.poll(() => execFileSync('git', ['show', ':example.ts'], { cwd: repo, encoding: 'utf8' })).toBe(selected)
  expect(fs.readFileSync(path.join(repo, 'example.ts'), 'utf8')).toBe(after)
  await expect(page.locator('.line-selection-bar')).toHaveCount(0)
  await selectLines(/neighbor/)
  await page.getByRole('button', { name: 'Discard Selected', exact: true }).click()
  await page.getByRole('button', { name: 'Confirm Discard?', exact: true }).click()
  await expect.poll(() => fs.readFileSync(path.join(repo, 'example.ts'), 'utf8')).toBe(selected)
  expect(execFileSync('git', ['show', ':example.ts'], { cwd: repo, encoding: 'utf8' })).toBe(selected)
})
