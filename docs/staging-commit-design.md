# Staging & Commit Interaction Design

Based on analysis of SourceGit, GitKraken, GitHub Desktop, and VS Code Git patterns.

## Overview

Git GUIs typically use a **3-panel layout** for staging and committing:

```
┌─────────────────┬──────────────────────┬─────────────────┐
│   File List     │      Diff View       │  Commit Panel   │
│                 │                      │                 │
│ ┌─────────────┐ │  @@ -1,5 +1,7 @@    │ ┌─────────────┐ │
│ │ Unstaged    │ │   function foo() {   │ │ Message     │ │
│ │ ● app.tsx   │ │ +   const x = 1;    │ │             │ │
│ │ ● style.css │ │ +   const y = 2;    │ │             │ │
│ └─────────────┘ │     return x;        │ └─────────────┘ │
│ ┌─────────────┐ │   }                  │                 │
│ │ Staged      │ │                      │ [Commit]        │
│ │ + utils.ts  │ │  [Stage Hunk]        │                 │
│ └─────────────┘ │                      │                 │
└─────────────────┴──────────────────────┴─────────────────┘
```

## Key Patterns from SourceGit & Others

### 1. File List Panel
- **Two sections**: Unstaged Changes, Staged Changes
- **File icons**: `M` modified, `A` added, `D` deleted, `R` renamed, `?` untracked
- **Actions per file**: Stage (+), Unstage (−), Discard changes
- **Bulk actions**: "Stage All", "Unstage All"

### 2. Diff View Panel
- **Unified diff** (default) or side-by-side
- **Syntax highlighting** for code
- **Hunk-level staging**: Click `+` on hunk header to stage just that hunk
- **Line-level staging** (advanced): Select lines → "Stage Selected"
- **Context lines**: Show surrounding unchanged lines

### 3. Commit Panel
- **Message input**: Summary line + optional description
- **Character count** on summary (50 char guideline)
- **Commit button**: Disabled until staged changes + message exist
- **Options**: Amend last commit, Sign commit

---

## Simplified Design for Ledger (Phase 1)

### Layout: Modify Focus Mode's Uncommitted Panel

When "Uncommitted" is selected in Focus Mode sidebar:

```
┌──────────────────────────────────────────────────────────┐
│ Detail Panel                                             │
├──────────────────────────────────────────────────────────┤
│ [Uncommitted Changes]          +12 −5  │  3 staged      │
├──────────────────────────────────────────────────────────┤
│                                                          │
│ UNSTAGED (2 files)                        [Stage All ▲] │
│ ┌────────────────────────────────────────────────────┐  │
│ │ ● app.tsx                                    [+]   │  │
│ │ ● styles/app.css                             [+]   │  │
│ └────────────────────────────────────────────────────┘  │
│                                                          │
│ STAGED (1 file)                         [Unstage All ▼] │
│ ┌────────────────────────────────────────────────────┐  │
│ │ + lib/utils.ts                               [−]   │  │
│ └────────────────────────────────────────────────────┘  │
│                                                          │
├──────────────────────────────────────────────────────────┤
│ DIFF PREVIEW (click file to view)                        │
│ ┌────────────────────────────────────────────────────┐  │
│ │ @@ -10,6 +10,8 @@                                  │  │
│ │    const foo = 1;                                  │  │
│ │ +  const bar = 2;                                  │  │
│ │ +  const baz = 3;                                  │  │
│ │    return foo;                                     │  │
│ └────────────────────────────────────────────────────┘  │
│                                                          │
├──────────────────────────────────────────────────────────┤
│ COMMIT                                                   │
│ ┌────────────────────────────────────────────────────┐  │
│ │ Summary (50 chars)                                 │  │
│ └────────────────────────────────────────────────────┘  │
│ ┌────────────────────────────────────────────────────┐  │
│ │ Description (optional)                             │  │
│ │                                                    │  │
│ └────────────────────────────────────────────────────┘  │
│                                                          │
│                                    [Commit Changes]      │
└──────────────────────────────────────────────────────────┘
```

### Interactions

| Action | Trigger | Git Command |
|--------|---------|-------------|
| Stage file | Click `[+]` button | `git add <file>` |
| Unstage file | Click `[−]` button | `git restore --staged <file>` |
| Stage all | Click "Stage All" | `git add -A` |
| Unstage all | Click "Unstage All" | `git restore --staged .` |
| View diff | Click file row | `git diff <file>` (unstaged) or `git diff --staged <file>` |
| Commit | Click "Commit" button | `git commit -m "message"` |

### State Flow

```
┌─────────────┐     Stage      ┌─────────────┐    Commit    ┌───────────┐
│  Unstaged   │ ────────────▶  │   Staged    │ ──────────▶  │ Committed │
│   Changes   │                │   Changes   │              │           │
└─────────────┘  ◀────────────  └─────────────┘              └───────────┘
                   Unstage
```

---

## API

Canonical types and API surface live in `app/types/electron.d.ts`.

Key types: `StagingFileDiff`, `StagingDiffHunk`, `StagingDiffLine`, `WorkingStatus`, `UncommittedFile`

---

## Phase 2 Enhancements

1. ✅ **Hunk-level staging**: Stage individual hunks instead of whole files
2. ✅ **Line-level staging**: Stage specific lines within a hunk
3. ✅ **Discard changes**: Revert unstaged changes for a file
4. ✅ **Inline editing**: Edit files directly in the diff view
5. 🔲 **Amend commit**: Modify the last commit
6. 🔲 **Commit templates**: Pre-fill commit message format
7. 🔲 **Keyboard shortcuts**: 
   - `s` - Stage selected file
   - `u` - Unstage selected file
   - `Enter` - Commit (when in message field)

---

## Implementation Status

### Phase 1 (Complete)
1. ✅ Git-service functions: `stageFile`, `unstageFile`, `stageAll`, `unstageAll`, `commitChanges`, `getFileDiff`
2. ✅ IPC handlers in main.ts
3. ✅ Preload bindings
4. ✅ Types in `electron.d.ts`
5. ✅ UI in `CommitCreatePanel.tsx` (also exported as `StagingPanel`)

### Phase 2 (Complete)
6. ✅ Hunk-level operations: `stageHunk`, `unstageHunk`, `discardHunk`
7. ✅ Line-level operations: `stageLines`, `unstageLines`, `discardLines`
8. ✅ Inline file editing: `getFileContent`, `saveFileContent`
9. ✅ Syntax highlighting via Shiki

---

## References

- [SourceGit](https://github.com/sourcegit-scm/sourcegit) - Avalonia-based Git GUI
- [GitKraken](https://www.gitkraken.com/) - Popular Git GUI with staging workflow
- [GitHub Desktop](https://desktop.github.com/) - Simple staging/commit UI
- [VS Code Git](https://code.visualstudio.com/docs/sourcecontrol/overview) - Integrated Git staging

