import { test, expect } from '@playwright/test'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { execFileSync } from 'child_process'
import { validateArgs } from '../lib/conveyor/schemas'
import { getRepositoryManager } from '../lib/repositories/repository-manager'
import { createRemoteRepositoryContext } from '../lib/repositories/repository-context'

test('PR checkout accepts the numeric ID used by the renderer and preload', () => {
  expect(validateArgs('checkout-pr-branch', [42])).toEqual([42])
  expect(() => validateArgs('checkout-pr-branch', ['feature/example'])).toThrow()
})

test('canvas configuration retains arbitrary panel settings through validation', () => {
  const canvas = {
    id: 'custom',
    name: 'Custom',
    columns: [
      {
        id: 'branches',
        slotType: 'list',
        panel: 'branches',
        width: 250,
        config: { sort: 'name', filters: { showRemote: false }, limit: 20 },
      },
    ],
  }
  expect(validateArgs('save-canvases', [[canvas]])).toEqual([[canvas]])
})

test('closing a local repository removes it without invalidating captured contexts', async () => {
  const repo = mkdtempSync(join(tmpdir(), 'ledger-context-'))
  const manager = getRepositoryManager()
  let id: string | undefined
  try {
    execFileSync('git', ['init', '-b', 'main'], { cwd: repo })
    const context = await manager.open(repo)
    id = context.id
    expect(context.type).toBe('local')
    expect(manager.close(id)).toBe(true)
    expect(manager.getSummary().some((entry) => entry.id === id)).toBe(false)
    expect(await context.git.checkIsRepo()).toBe(true)
    const remote = createRemoteRepositoryContext('example', 'repo', {
      default_branch: 'main',
      html_url: 'https://github.com/example/repo',
    })
    expect(remote).toMatchObject({ type: 'remote', path: null, git: null })
    expect(remote.remote.fullName).toBe('example/repo')
  } finally {
    if (id) manager.close(id)
    rmSync(repo, { recursive: true, force: true })
  }
})
