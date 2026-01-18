# Omnibus Branch Test Checklist

This document contains the test checklist for the omnibus branch with 10 major features.

## Bugs Fixed from Code Review

The following bugs were identified by Cursor Bugbot and fixed:

1. **Partial patch context bug (High)** - Fixed in `git-service.ts` and `staging-service.ts`
   - Non-selected add lines were incorrectly converted to context, but they don't exist in the index
   - Fix: Non-selected add lines are now omitted entirely; non-selected delete lines become context

2. **Multi-hunk stale indices (Medium)** - Fixed in `CommitCreatePanel.tsx`
   - Sequential hunk processing caused index drift after each operation
   - Fix: Hunks are now processed in reverse order (highest index first)

3. **Line selections not cleared (Low)** - Fixed in `CommitCreatePanel.tsx`
   - Line selections persisted after hunk stage/unstage/discard operations
   - Fix: `clearLineSelection()` is now called after each hunk operation

4. **Highlighter memory leak (Medium)** - Fixed in `syntax-highlighter.ts`
   - Old Shiki highlighter instance wasn't disposed when theme changed
   - Fix: Old instance is now disposed before creating new one

5. **Shift-click includes context lines (Low)** - Fixed in `CommitCreatePanel.tsx`
   - Shift-click range selection added all line indices, including non-actionable context lines
   - `getSelectedLinesCount()` counted context lines, showing inflated count in success message
   - Fix: Shift-click now filters out context lines; count only includes add/delete lines

---

## 1. Branch Renaming

*Files: `git-service.ts`, `main.ts`, `preload.ts`, `BranchDetailPanel.tsx`*

- [ ] Rename a non-current local branch (happy path)
- [ ] Rename the current (checked out) branch
- [ ] Verify main/master branches cannot be renamed (should show error)
- [ ] Verify cannot rename TO main/master
- [ ] Verify branch name validation (no spaces, must start with letter/number)
- [ ] Verify error if new name already exists
- [ ] Verify sidebar focus updates to new branch name after rename
- [ ] Test "Rename Branch" button disabled during switching/deleting operations

---

## 2. Hunk-level Staging Operations

*Files: `staging-service.ts`, `CommitCreatePanel.tsx`*

- [ ] Stage a single hunk from an unstaged file (click "Stage" on hunk header)
- [ ] Unstage a single hunk from a staged file (click "Unstage" on hunk header)
- [ ] Discard a single hunk (requires confirmation click)
- [ ] Verify diff updates after each operation
- [ ] Test with multi-hunk files (verify correct hunk is affected)
- [ ] Test with binary files (should show appropriate message)

---

## 3. Line-level Staging Operations

*Files: `staging-service.ts`, `CommitCreatePanel.tsx`*

- [ ] Click a single add/delete line to select it
- [ ] Shift-click to select a range of lines
- [ ] Stage selected lines (click "Stage Selected")
- [ ] Unstage selected lines from staged file
- [ ] Discard selected lines (requires confirmation)
- [ ] Verify selection clears after operation
- [ ] Verify selection bar shows correct count
- [ ] Test cross-hunk selection is handled per-hunk

---

## 4. Inline File Editing

*Files: `staging-service.ts`, `CommitCreatePanel.tsx`*

- [ ] Click "Edit" button on unstaged file diff
- [ ] Verify editor loads with file content
- [ ] Make edits and click "Save"
- [ ] Verify diff updates to show new changes
- [ ] Click "Cancel" to discard edits
- [ ] Verify "Edit" button hidden for staged files
- [ ] Verify "Edit" button hidden for deleted files
- [ ] Test security: cannot edit files outside repo (path traversal)

---

## 5. PR File Diff (Parsed Format)

*Files: `git-service.ts`, `pr-handler.ts`, `PRDetailPanel.tsx`*

- [ ] Open a PR detail panel
- [ ] Select a changed file
- [ ] Verify diff displays with proper hunks (not raw text)
- [ ] Verify line numbers display correctly
- [ ] Verify add/delete/context lines are colored
- [ ] Test with binary files in PR
- [ ] Verify "View on GitHub" link works

---

## 6. Worktree Activity Tracking (Dual-signal)

*Files: `worktree-service.ts`, `worktree-types.ts`, `WorktreeDetailPanel.tsx`*

- [ ] View a Cursor/Claude agent worktree detail
- [ ] Verify "Activity Details" shows for active/recent worktrees
- [ ] Verify file timestamp (`lastFileModified`) displays
- [ ] Verify git timestamp (`lastGitActivity`) displays
- [ ] Verify `activitySource` hint shows ('files' or 'git')
- [ ] Test activity status calculation: active (<5min), recent (<1hr), stale

---

## 7. Behind Main Count Indicator

*Files: `staging-service.ts`, `CommitCreatePanel.tsx`*

- [ ] Open staging panel on a branch that's behind main
- [ ] Verify "X behind main" indicator appears in header
- [ ] Verify indicator hidden when on main/master
- [ ] Verify indicator updates when switching branches

---

## 8. Stash Pop

*Files: `StashDetailPanel.tsx`*

- [ ] Create a stash to test with
- [ ] Open stash detail panel
- [ ] Click "Pop" button (apply and remove)
- [ ] Verify stash is applied AND removed from list
- [ ] Verify "Apply" still works (keeps stash in list)
- [ ] Test "Drop" still works (removes without applying)

---

## 9. Syntax Highlighting (Shiki)

*Files: `syntax-highlighter.ts`, `CommitCreatePanel.tsx`*

- [ ] Select a TypeScript/JavaScript file in staging
- [ ] Verify diff lines have syntax highlighting
- [ ] Test with Python, CSS, JSON, Markdown files
- [ ] Verify performance is acceptable with large diffs
- [ ] Verify files with unknown extensions show no highlighting (graceful fallback)

---

## 10. Claude Code Agent Task Hints

*Files: `worktree-service.ts`*

- [ ] Create a worktree with Claude Code (in `~/.claude/worktrees/`)
- [ ] Verify agent task hint appears in worktree detail
- [ ] Verify hint shows first user message from session file

---

## Schema/Type Changes to Verify

- [ ] `StagingDiffHunk.rawPatch` is populated correctly
- [ ] `StagingDiffLine.lineIndex` is populated (0-based per hunk)
- [ ] `Worktree.lastFileModified` is ISO string
- [ ] `Worktree.lastGitActivity` is ISO string
- [ ] `Worktree.activitySource` is one of: 'file' | 'git' | 'both'

---

## Build/Package Checks

- [ ] `npm run dev` starts successfully
- [ ] `npm run build:mac:arm64` completes
- [ ] `npm test` passes (Playwright E2E)
- [ ] `npm run lint` passes
- [ ] Verify `shiki` is in dependencies (package.json)

---

## Edge Cases to Test

- [ ] Empty repository (no commits)
- [ ] Detached HEAD state
- [ ] Merge conflict state
- [ ] Large files (>1MB)
- [ ] Files with special characters in path
- [ ] Newly created (untracked) files

