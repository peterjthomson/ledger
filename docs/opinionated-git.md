# Opinionated Git Behaviors

Ledger is opinionated about common git paper cuts. Rather than showing cryptic git errors, we handle common situations automatically.

## Philosophy

Git's CLI is conservative and shows warnings/errors for situations that rarely cause real problems. Ledger is smarter about these cases:

1. **Try the smart thing first**
2. **Only fail on real conflicts**
3. **Provide clear options when intervention is needed**

---

## Auto-Stash on Pull

**The Problem:** Git refuses to pull if you have ANY uncommitted changes, even if those changes don't conflict with incoming changes.

```
error: cannot pull with rebase: You have unstaged changes.
error: please commit or stash them.
```

**Ledger's Solution:** Auto-stash, pull, then restore.

```
Pull requested with uncommitted changes
    ↓
Stash changes (including untracked files)
    ↓
Pull with rebase
    ↓
Pop stash to restore changes
    ↓
✓ "Pulled 3 commits and restored your uncommitted changes"
```

**When it fails:** Only if there's an actual conflict between your uncommitted changes and the pulled changes. In that case, Ledger will tell you exactly what happened.

**Implementation:** `pullCurrentBranch()` in `git-service.ts`

---

## Leapfrog Commit (Behind-Check Before Commit)

**The Problem:** You stage changes and commit, only to realize origin has moved ahead. Now you need to pull, deal with merge commits, or rebase. Normal git just commits and leaves you to sort out the mess later.

**Ledger's Solution:** Before committing, fetch and check if you're behind origin. If so, offer to "leapfrog" over the incoming commits by pulling first, then committing on top.

```
User clicks "Commit"
    ↓
Fetch origin (silent)
    ↓
Are we behind? → Yes → Show prompt:
                        ┌─────────────────────────────────────┐
                        │ ⚠️ Origin has 3 new commits         │
                        │                                     │
                        │ [Pull & Commit] [Commit Anyway] [X] │
                        └─────────────────────────────────────┘
    ↓ No
Commit normally
```

**Options:**
- **Pull & Commit** (Leapfrog) — Pull first (with auto-stash magic), then commit on top of the latest
- **Commit Anyway** — Commit behind origin (creates diverged history you'll need to reconcile later)
- **Cancel** — Think about it

**When it aborts:** If the pull causes conflicts with your uncommitted changes, the leapfrog aborts and asks you to resolve conflicts first. Your changes are preserved.

**Implementation:** `commitChanges(message, description, force)` in `git-service.ts`

---

## PR Preview (Virtual Merge)

**The Problem:** You have a branch and want to know "is this branch still useful?" Standard git diffs are confusing:

- `git diff master..branch` — Shows everything different between them, including noise from master moving forward
- `git diff master...branch` — Shows all changes made on the branch, but some may be obsolete or already superseded

Neither answers the real question: **"What would this branch actually contribute if merged right now?"**

**Ledger's Solution:** PR Preview simulates a merge and shows only the unique contribution.

```
User views branch detail panel
    ↓
"PR Preview" tab (default)
    ↓
git merge-tree --write-tree master branch
    ↓
Diff the merge result against master
    ↓
✓ Shows exactly what a PR would contribute
  (Same as GitHub's PR diff view)
```

**Three Diff Views:**

| View | Git Equivalent | Use Case |
|------|---------------|----------|
| **PR Preview** | `merge-tree` + diff | "Is this branch still useful?" |
| **Branch Diff** | `master..branch` (two-dot) | Raw current state comparison |
| **Branch Changes** | `master...branch` (three-dot) | Historical view of work done |

**Conflict Detection:** If the branch has merge conflicts with master, PR Preview shows:
- ⚠️ badge with conflict count
- Tooltip listing conflicting files
- Still shows the non-conflicting diffs

**Why this matters:**
- Stale branches that were forked ages ago often show huge diffs vs master
- After master moves forward, it's hard to tell if the branch has unique value
- PR Preview cuts through the noise to show exactly what matters

**Implementation:** `getBranchMergePreview()` in `git-service.ts`

---

## Future Opinions

Things we might handle automatically in the future:

### Auto-fetch on Focus
Fetch origin when the app gains focus so you always see up-to-date behind/ahead counts.

### Smart Branch Cleanup
When a branch is merged and deleted on origin, offer to clean up the local branch.

### Conflict Prevention
Before switching branches, warn if you have uncommitted changes that would conflict.

### Stash Naming
When auto-stashing, use meaningful names like `ledger-auto-stash-for-pull` so you can identify Ledger's stashes.

---

## Disabling Opinions

Currently, these behaviors are always on. In the future, we may add settings to disable specific behaviors for users who prefer vanilla git.

---

## Contributing

Found a git paper cut that Ledger should handle better? Open an issue describing:

1. The git error/situation
2. Why it's annoying
3. What the smart behavior should be

