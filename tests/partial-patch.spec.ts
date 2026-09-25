import { test, expect } from '@playwright/test'
import { execFileSync } from 'child_process'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { buildPartialPatch } from '../lib/services/staging/partial-patch'
import type { StagingDiffHunk } from '../lib/services/staging/staging-types'
import { changedRanges } from '../app/utils/inline-diff'
import { sortBranches } from '../app/components/panels/list/list-filters'
import type { Branch } from '../app/types/electron'

// Explicit file contents are independent of the patch-building algorithm.
const cases = [
  {
    name: 'first replacement',
    selection: [0, 2],
    forward: 'first\nnew one\nold two\nlast\n',
    reverse: 'first\nold one\nnew two\nlast\n',
  },
  {
    name: 'second replacement',
    selection: [1, 3],
    forward: 'first\nold one\nnew two\nlast\n',
    reverse: 'first\nnew one\nold two\nlast\n',
  },
  {
    name: 'deletion only',
    selection: [0],
    forward: 'first\nold two\nlast\n',
    reverse: 'first\nold one\nnew one\nnew two\nlast\n',
  },
  {
    name: 'addition only',
    selection: [2],
    forward: 'first\nold one\nnew one\nold two\nlast\n',
    reverse: 'first\nnew two\nlast\n',
  },
  {
    name: 'all changes',
    selection: [0, 1, 2, 3],
    forward: 'first\nnew one\nnew two\nlast\n',
    reverse: 'first\nold one\nold two\nlast\n',
  },
]

for (const reverse of [false, true]) {
  for (const fixture of cases) {
    const { selection } = fixture
    test(`partial patch ${reverse ? 'reverse' : 'forward'} ${fixture.name}`, () => {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ledger-patch-'))
      const git = (...args: string[]) =>
        execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] })
      try {
        git('init', '-b', 'main')
        const filePath = 'space name.txt'
        const file = path.join(root, filePath)
        const original = 'first\nold one\nold two\nlast\n'
        const changed = 'first\nnew one\nnew two\nlast\n'
        fs.writeFileSync(file, reverse ? changed : original)
        git('add', '.')
        const hunk: StagingDiffHunk = {
          oldStart: 1,
          oldLines: 4,
          newStart: 1,
          newLines: 4,
          header: '',
          rawPatch: '',
          lines: [
            { type: 'context', content: 'first', lineIndex: 4 },
            { type: 'delete', content: 'old one', lineIndex: 0 },
            { type: 'delete', content: 'old two', lineIndex: 1 },
            { type: 'add', content: 'new one', lineIndex: 2 },
            { type: 'add', content: 'new two', lineIndex: 3 },
            { type: 'context', content: 'last', lineIndex: 5 },
          ],
        }
        const patch = buildPartialPatch(filePath, hunk, selection, reverse)
        execFileSync('git', ['apply', ...(reverse ? ['-R'] : []), '-'], { cwd: root, input: patch })
        expect(fs.readFileSync(file, 'utf8')).toBe(reverse ? fixture.reverse : fixture.forward)
      } finally {
        fs.rmSync(root, { recursive: true, force: true })
      }
    })
  }
}

test('inline changes preserve shared text, Unicode, and separate edits', () => {
  const a = 'hello 🐈 red world!'
  const b = 'hello 🐕 red earth!'
  const [oldRanges, newRanges] = changedRanges(a, b)
  expect(oldRanges.map((r) => a.slice(r.start, r.end)).join('')).toBe('🐈wold')
  expect(newRanges.map((r) => b.slice(r.start, r.end)).join('')).toBe('🐕eath')
  expect(changedRanges('unchanged', 'unchanged')).toEqual([[], []])
  expect(changedRanges('abc', 'abxc')).toEqual([[], [{ start: 2, end: 3 }]])
  expect(changedRanges('a'.repeat(1000), 'b'.repeat(1000))).toEqual([
    [{ start: 0, end: 1000 }],
    [{ start: 0, end: 1000 }],
  ])
})

for (const sort of ['name', 'last-commit', 'first-commit', 'most-commits'] as const) {
  test(`#71 pins current and primary branches under ${sort} sorting`, () => {
    const branches = [
      { name: 'aaa', lastCommitDate: '2026-01-01', firstCommitDate: '2020-01-01', commitCount: 50 },
      { name: 'main' },
      { name: 'master' },
      { name: 'zzz', current: true },
    ] as Branch[]
    expect(sortBranches(branches, sort).map((b) => b.name)).toEqual(['zzz', 'main', 'master', 'aaa'])
    expect(branches[0].name).toBe('aaa')
  })
}
