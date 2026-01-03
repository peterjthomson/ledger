## Git Commands (Ledger) — Bottom-up Surface Area

This document is a **bottom-up index** of the Git operations Ledger performs — grouped by **where they’re triggered in the UI**, and deduplicated into a small number of recurring command “shapes”.

The goal is twofold:

- **Efficency**: show how an opinionated UI composes _familiar_ git primitives into faster, safer, more repeatable workflows.
- **Simplicity**: Ledger should feel like a transparent layer on top of “the git you already know and love”, not a mysterious abstraction.

---

## Ledger’s trust contract (what we mean by “transparent”)

- **Every meaningful action maps to git you can recognize**: checkout, stash, worktree, diff, log, reset, push/pull, etc.
- **The UI is opinionated, not magical**: the “power” comes from sequencing commands (and choosing defaults) you could run manually.
- **You can verify the behavior**: each UI intent below lists the underlying commands Ledger runs (or the `simple-git` equivalent).
- **Writes are intentional**: read-only views call read-only git; write operations are triggered by explicit UI actions (buttons / confirmations), with a few deliberate safety automations like “auto-stash before checkout”.

### Plugins & automation (permission-gated)

Ledger supports plugins. For trust and safety:

- **Plugins must declare permissions** like `git:read` and `git:write`.
- **Arbitrary “run git args” access is intentionally limited** in the plugin API today; plugins are expected to use Ledger’s specific, typed operations rather than shelling out invisibly.

If/when we expand plugin automation (e.g. background fetch), it should remain **permission-gated** and follow the same “UI intent → explicit commands” philosophy.

---

## Read vs write: quick mental model

If you’re coming from the command line, the fastest way to feel safe is knowing when Ledger is **reading** vs **mutating** your repo.

### Read-only shapes (no repo mutation)

- `git status` / `git status --porcelain`
- `git log …`
- `git show …`
- `git diff …`
- `git rev-parse …`
- `git rev-list …`
- `git branch …` _(listing)_
- `git worktree list …`
- `git shortlog …`
- `git merge-tree …` _(simulation; does not merge)_

### Write shapes (repo/worktree mutation)

- `git checkout …`
- `git branch <name>` / `git branch -d/-D …`
- `git add …`
- `git commit …`
- `git stash push/apply/pop/drop/branch …`
- `git pull …` / `git fetch …` _(writes refs)_
- `git push …` _(writes to remote)_
- `git reset …`
- `git restore …`
- `git clean …`
- `git worktree add/remove …`
- `git apply …`

---

## How to verify (CLI cross-check)

Ledger is intentionally “plain git” underneath. For any row below, you should be able to reproduce the same result from Terminal by running the listed commands in the same repo/worktree directory.

- **Repo vs worktree**: most operations run in either the repo root (`cwd = repoPath`) or a worktree folder (`cwd = worktreePath`). The tables call this out where it matters.
- **`simple-git` vs CLI**: `simple-git` ultimately shells out to git; when we show `git.raw([...])` or `git.status()`, treat it as the equivalent git command with those args.

---

## Execution model: how Ledger runs git

Ledger runs git in two ways:

- **`simple-git` wrapper (Node/main process)**: most operations are expressed as `SimpleGit` calls (often via `git.raw([...])`), e.g. `branch`, `log`, `status`, `checkout`, `push`, `pull`, `stash`, `reset`, `worktree`.
- **Raw `git` CLI**: used selectively for a few performance/safety-sensitive flows (e.g. worktree stats, patch extraction/apply). This happens via:
  - **`safeExec('git', ['args'...])`** (preferred, argv-based), e.g. in `lib/services/worktree/worktree-service.ts`
  - **`execAsync('git ...')`** (string-based, legacy), e.g. in `lib/main/git-service.ts`

The renderer triggers these operations via:

- **`window.electronAPI.*`** (direct IPC surface, e.g. `get-worktrees`, `checkout-branch`)
- **`window.conveyor.*`** (a typed wrapper over the same IPC surface; used by some panels and plugins)

---

## Branches & Remotes

Primary UI surfaces:

- **Branch list**: `app/components/panels/list/BranchList.tsx`
- **Branch detail**: `app/components/panels/editor/BranchDetailPanel.tsx`

| UI intent (where)                                                       | IPC / API call                                      | Implementation                                                                                | Git backend          | Commands (unique shapes)                                                                                                                                                                                                                   |
| ----------------------------------------------------------------------- | --------------------------------------------------- | --------------------------------------------------------------------------------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Load branches (Branch list)                                             | `get-branches-basic` / `get-branches-with-metadata` | `lib/services/branch/branch-service.ts` (and legacy equivalents in `lib/main/git-service.ts`) | `simple-git`         | `git branch -a -v`<br>`git branch -a --no-merged <origin/master \| origin/main>`<br>Metadata (optional): `git log <branch> -1 --format=%ci` / `git log <branch> --reverse --format=%ci -1` / `git rev-list --count <branch>`               |
| Checkout local branch (Branch detail + dblclick in list)                | `checkout-branch`                                   | `lib/services/branch/branch-service.ts`                                                       | `simple-git`         | **Sequence**:<br>`git status` → _(if dirty)_ `git stash push --include-untracked -m "Ledger auto-stash …"` → `git checkout --ignore-other-worktrees <branch>`                                                                              |
| Checkout remote branch (Remotes list / context)                         | `checkout-remote-branch`                            | `lib/services/branch/branch-service.ts`                                                       | `simple-git`         | **Sequence**:<br>`git status` → _(if dirty)_ `git stash push --include-untracked -m "Ledger auto-stash …"` → `git checkout --ignore-other-worktrees -b <local> --track <remote/branch>` _(or checkout existing local)_                     |
| Create branch (Branch list “+ New Branch”, Staging “Create new branch”) | `create-branch`                                     | `lib/services/branch/branch-service.ts`                                                       | `simple-git`         | `git branch <name>` _(no checkout)_<br>or `git checkout -b <name>` _(via `checkoutLocalBranch`)_                                                                                                                                           |
| Delete local branch (Branch detail action)                              | `delete-branch`                                     | `lib/services/branch/branch-service.ts`                                                       | `simple-git`         | `git branch -d <name>` _(or `-D` if force)_                                                                                                                                                                                                |
| Delete remote branch (Remotes detail action)                            | `delete-remote-branch`                              | `lib/main/git-service.ts`                                                                     | `simple-git` (`raw`) | `git push origin --delete <branch>`                                                                                                                                                                                                        |
| Push branch (Branch detail action, after commit)                        | `push-branch`                                       | `lib/services/branch/branch-service.ts`                                                       | `simple-git`         | `git push --set-upstream origin <branch>` _(default)_                                                                                                                                                                                      |
| Pull remote branch (Branch list context / app action)                   | `pull-branch`                                       | `lib/services/branch/branch-service.ts`                                                       | `simple-git`         | **Sequence**:<br>`git status` → _(if dirty)_ `git stash push --include-untracked -m "Ledger auto-stash …"` → `git pull <remote> <branch>`                                                                                                  |
| Branch diff / “PR Preview” (Branch detail tabs)                         | `get-branch-diff`                                   | `lib/main/git-service.ts`                                                                     | `simple-git` (`raw`) | **Two modes**:<br>- “Diff/Changes”: `git diff <base..branch \| base...branch> --patch --stat`<br>- “PR Preview”: `git merge-tree --write-tree <base> <branch>` → `git diff <base> <treeSha> --patch --stat` _(fallback to three-dot diff)_ |

---

## Worktrees

Primary UI surfaces:

- **Worktree list**: `app/components/panels/list/WorktreeList.tsx`
- **Worktree detail**: `app/components/panels/editor/WorktreeDetailPanel.tsx`
- **Worktree create**: `app/components/panels/editor/WorktreeCreatePanel.tsx`

| UI intent (where)                                                        | IPC / API call                                                                                     | Implementation                                                                                    | Git backend              | Commands (unique shapes)                                                                                                                                                                                                                                                                                                |
| ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| List worktrees + metadata (Worktree list)                                | `get-worktrees`                                                                                    | `lib/services/worktree/worktree-service.ts` (and legacy equivalents in `lib/main/git-service.ts`) | `simple-git` + `git` CLI | `git worktree list --porcelain`<br>Worktree stats: `git status --porcelain` + `git diff --shortstat`<br>Worktree “last commit msg”: `git log -1 --format=%s`                                                                                                                                                            |
| Create worktree (Worktree create)                                        | `create-worktree`                                                                                  | `lib/services/worktree/worktree-service.ts`                                                       | `simple-git` (`raw`)     | `git worktree add -b <branch> <path>` _(new branch)_<br>`git worktree add <path> <branch>` _(existing branch)_                                                                                                                                                                                                          |
| Remove worktree (Worktree detail)                                        | `remove-worktree`                                                                                  | `lib/services/worktree/worktree-service.ts`                                                       | `simple-git` + `git` CLI | **Sequence**:<br>`git status --porcelain` _(guard when not forcing)_ → `git worktree remove [--force] <path>`                                                                                                                                                                                                           |
| Apply worktree changes to main repo (Worktree detail “Apply”)            | `apply-worktree-changes`                                                                           | `lib/services/worktree/worktree-service.ts`                                                       | `git` CLI + `simple-git` | **Sequence**:<br>From worktree: `git diff HEAD` + `git ls-files --others --exclude-standard`<br>Into main repo: `git apply --3way <patch>` _(fallback: `git apply --reject --whitespace=fix <patch>`)_<br>Plus filesystem copy of untracked files                                                                       |
| Convert worktree → new branch (Worktree detail “Create Branch” / rescue) | `convert-worktree-to-branch`                                                                       | `lib/services/worktree/worktree-service.ts`                                                       | `git` CLI + `simple-git` | **Sequence**:<br>From worktree: `git diff HEAD` + `git ls-files --others --exclude-standard`<br>Main repo: `git status` → _(if dirty)_ `git stash push --include-untracked -m "Ledger auto-stash …"` → `git checkout -b <newBranch> <baseRef>` → `git apply …` → `git add -A` → `git commit "Changes from worktree: …"` |
| Worktree-local staging/commit/push (Worktree detail “Review & Commit”)   | `get-worktree-working-status`, `stage-*-in-worktree`, `commit-in-worktree`, `push-worktree-branch` | `lib/main/git-service.ts`                                                                         | `simple-git`             | Status: `git status`<br>Stage: `git add <file>` / `git add -A`<br>Unstage: `git restore --staged <file>` / `git restore --staged .`<br>Diff: `git diff [--staged] -- <file>`<br>Commit: `git commit`<br>Push: `git push --set-upstream origin <branch>`                                                                 |

---

## Pull requests (create / review / merge)

Primary UI surfaces:

- **Branch detail PR creation**: `app/components/panels/editor/BranchDetailPanel.tsx`
- **Changes panel “Commit → Push → PR”**: `app/components/panels/editor/CommitCreatePanel.tsx`
- **PR review**: `app/components/panels/editor/PRDetailPanel.tsx`

Ledger’s PR integrations are **primarily driven by the GitHub CLI (`gh`)**, but a few **git** commands are consistently involved (push + stash safety).

| UI intent (where)                               | IPC / API call        | Implementation                                                                  | Git backend         | Git commands involved                                                                                                                                    |
| ----------------------------------------------- | --------------------- | ------------------------------------------------------------------------------- | ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Create PR (Branch detail / Changes panel)       | `create-pull-request` | `lib/main/git-service.ts` (plus `window.conveyor.pr.createPullRequest` wrapper) | `simple-git` + `gh` | Typically preceded by `git push --set-upstream origin <branch>`                                                                                          |
| Checkout PR branch (PR list / PR review action) | `checkout-pr-branch`  | `lib/main/git-service.ts`                                                       | `simple-git` + `gh` | **Sequence**:<br>`git status` → _(if dirty)_ `git stash push --include-untracked -m "Ledger auto-stash …"` → _(then `gh pr checkout …`)_                 |
| Merge PR (PR review)                            | `merge-pr`            | `lib/main/git-service.ts`                                                       | `simple-git` + `gh` | On “dirty working tree” failure: `git stash push --include-untracked -m ledger-auto-stash-for-merge` → _(retry merge)_ → `git stash pop` _(best-effort)_ |

---

## Staging & Commit (“Changes” panel)

Primary UI surface:

- **Changes / staging + commit**: `app/components/panels/editor/CommitCreatePanel.tsx`

This panel uses **`window.conveyor.*`** for most actions, but the underlying IPC handlers map to the same git operations as `window.electronAPI.*`.

| UI intent (where)                                  | IPC / API call                                                                                          | Implementation                                                                                  | Git backend          | Commands (unique shapes)                                                                                                                                                                                                                                                           |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Working status (file list + counts)                | `get-working-status`                                                                                    | `lib/main/git-service.ts` (plus service equivalents)                                            | `simple-git`         | `git status`                                                                                                                                                                                                                                                                       |
| Stage / unstage / discard                          | `stage-file`, `unstage-file`, `stage-all`, `unstage-all`, `discard-file-changes`, `discard-all-changes` | `lib/services/staging/staging-service.ts` (and legacy equivalents in `lib/main/git-service.ts`) | `simple-git` (`raw`) | Stage: `git add <file>` / `git add -A`<br>Unstage: `git restore --staged <file>` / `git restore --staged .`<br>Discard (tracked): `git restore <file>` / `git restore .`<br>Discard (untracked): `git clean -fd`                                                                   |
| Diff a working tree file                           | `get-file-diff`                                                                                         | `lib/services/staging/staging-service.ts`                                                       | `simple-git` (`raw`) | `git diff -- <file>` or `git diff --staged -- <file>`                                                                                                                                                                                                                              |
| Commit staged changes (with “behind origin” check) | `commit-changes`                                                                                        | `lib/services/commit/commit-service.ts` (and legacy in `lib/main/git-service.ts`)               | `simple-git`         | **Sequence**:<br>`git status` → _(unless forced)_ `git fetch origin <current>` → `git status` _(check `behind`)_ → `git commit <message>`                                                                                                                                          |
| “Pull & Commit” helper (behind prompt)             | `pull-current-branch`                                                                                   | `lib/main/git-service.ts`                                                                       | `simple-git` (`raw`) | **Sequence**:<br>`git fetch origin <current>` → `git status` _(check `behind`)_ → _(if dirty)_ `git stash push --include-untracked -m ledger-auto-stash-for-pull` → `git pull origin <current> --rebase` → `git stash pop` _(conflict-aware; may `git rebase --abort` on failure)_ |

---

## Stashes

Primary UI surfaces:

- **Stash list**: `app/components/panels/list/StashList.tsx`
- **Stash detail**: `app/components/panels/editor/StashDetailPanel.tsx`

| UI intent (where)                                     | IPC / API call                           | Implementation                                                                  | Git backend          | Commands (unique shapes)                                                                                                                                                                                                                   |
| ----------------------------------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| List stashes (+ “redundant” detection)                | `get-stashes`                            | `lib/services/stash/stash-service.ts` (and legacy in `lib/main/git-service.ts`) | `simple-git` (`raw`) | `git stash list --format=%gd\|%gs\|%ci`<br>Redundancy check (Ledger-specific): `git stash show --name-only stash@{n}` → for each file: `git show stash@{n}:<file>` vs `git show <branch>:<file>` _(or `origin/<branch>`)_                  |
| Stash file list                                       | `get-stash-files`                        | `lib/services/stash/stash-service.ts`                                           | `simple-git` (`raw`) | `git stash show stash@{n} --numstat` + `git stash show stash@{n} --name-status`                                                                                                                                                            |
| Stash diff (single file)                              | `get-stash-file-diff`                    | `lib/services/stash/stash-service.ts`                                           | `simple-git` (`raw`) | `git diff stash@{n}^ stash@{n} -- <file>`                                                                                                                                                                                                  |
| Apply / pop / drop stash                              | `apply-stash`, `pop-stash`, `drop-stash` | `lib/services/stash/stash-service.ts`                                           | `simple-git` (`raw`) | `git stash apply stash@{n}` / `git stash pop stash@{n}` / `git stash drop stash@{n}`                                                                                                                                                       |
| Create branch from stash                              | `stash-to-branch`                        | `lib/services/stash/stash-service.ts`                                           | `simple-git` (`raw`) | `git stash branch <branch> stash@{n}`                                                                                                                                                                                                      |
| Apply stash to a different branch (Ledger “leapfrog”) | `apply-stash-to-branch`                  | `lib/main/git-service.ts`                                                       | `simple-git` (`raw`) | **Sequence** (if no existing worktree):<br>`git worktree list --porcelain` → `git worktree add <path> <target>` → `git stash apply stash@{n}` _(in worktree)_ → `git add .` → `git commit "Apply stash: …"` → `git worktree remove <path>` |

---

## Focus mode (Graph + Commit diff)

Primary UI surfaces:

- **Graph**: `app/components/panels/viz/GitGraph.tsx`
- **Diff viewer**: `app/components/panels/editor/DiffPanel.tsx`

| UI intent (where)  | IPC / API call             | Implementation                                                                    | Git backend          | Commands (unique shapes)                                                                                           |
| ------------------ | -------------------------- | --------------------------------------------------------------------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Load graph commits | `get-commit-graph-history` | `lib/services/commit/commit-service.ts` (and legacy in `lib/main/git-service.ts`) | `simple-git` (`raw`) | `git log --format=%H\|%h\|%s\|%an\|%ci\|%P\|%D -n <N> --all`<br>Optional stats: `git show --stat --format= <hash>` |
| Load commit diff   | `get-commit-diff`          | `lib/services/commit/commit-service.ts` (and legacy in `lib/main/git-service.ts`) | `simple-git` (`raw`) | `git show --format=%H\|%s\|%an\|%ci -s <hash>`<br>`git show --format= --patch --stat <hash>`                       |
| Reset to commit    | `reset-to-commit`          | `lib/services/commit/commit-service.ts`                                           | `simple-git`         | `git reset --<soft\|mixed\|hard> <hash>` _(hard reset may stash first in some flows)_                              |

---

## Analytics (Contributors)

Primary UI surface:

- **Contributor chart**: `app/components/panels/viz/ContributorChart.tsx`

| UI intent (where)                | IPC / API call          | Implementation            | Git backend          | Commands                                             |
| -------------------------------- | ----------------------- | ------------------------- | -------------------- | ---------------------------------------------------- |
| Contributor activity time series | `get-contributor-stats` | `lib/main/git-service.ts` | `simple-git` (`raw`) | `git log --use-mailmap --format=%aN\|%aE\|%ci --all` |

---

## Tech tree (Merged branches)

Primary UI surface:

- **Tech tree chart**: `app/components/panels/viz/TechTreeChart.tsx`

| UI intent (where)                           | IPC / API call           | Implementation            | Git backend          | Commands                                                                                                                                       |
| ------------------------------------------- | ------------------------ | ------------------------- | -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Recent merge commits on main/master + stats | `get-merged-branch-tree` | `lib/main/git-service.ts` | `simple-git` (`raw`) | `git log <main\|master> --first-parent --merges --format=%H\|%ai\|%an\|%s -n <N>`<br>Per merge commit: `git show --stat --format= <mergeHash>` |

---

## Repo management (Open / Switch / Clone)

Primary UI surfaces:

- **Repo picker / switcher**: `app/components/RepoSwitcher.tsx` (and top-level `app/app.tsx` load path)

| UI intent (where)                        | IPC / API call                   | Implementation                           | Git backend  | Commands                                                                |
| ---------------------------------------- | -------------------------------- | ---------------------------------------- | ------------ | ----------------------------------------------------------------------- |
| Validate repo path + normalize to root   | `select-repo`, `open-repository` | `lib/repositories/repository-context.ts` | `simple-git` | `git rev-parse --show-toplevel` _(via `revparse(['--show-toplevel'])`)_ |
| Detect default branch                    | (internal)                       | `lib/repositories/repository-context.ts` | `simple-git` | `git remote show origin` _(parse “HEAD branch: …”)_                     |
| Clone repository (Ledger repo clone)     | `clone-repository`               | `lib/conveyor/handlers/repo-handler.ts`  | `simple-git` | `git clone <url> <path>`                                                |
| Clone plugin repository (plugin install) | (plugin ops)                     | `lib/main/plugin-service.ts`             | `simple-git` | `git clone --depth 1 <url> <path>`                                      |

---

## Design signatures (sequential command workflows)

These multi-command sequences are the most “Ledger-shaped” opinions in the codebase:

- **Auto-stash before changing context**:
  - Checkout branch: `status → stash push → checkout --ignore-other-worktrees`
  - PR checkout: `status → stash push → gh pr checkout …`
  - PR merge (when blocked by dirty working tree): `stash push → gh pr merge … → stash pop`
- **Pull with “stash/rebase/unstash”** (avoid merge commits, only fail on real conflicts):
  - `fetch → status(behind) → stash push (if dirty) → pull --rebase → stash pop (conflict-aware) → (maybe rebase --abort)`
- **Commit gating on remote drift**:
  - `status → fetch origin <current> → status(behind) → commit`
- **Worktree-first workflows**:
  - Worktree apply: `diff HEAD + ls-files` (in worktree) → `apply --3way` (in main repo)
  - Worktree rescue into new branch: `diff/ls-files` → `stash push` → `checkout -b` → `apply` → `add -A` → `commit`
- **PR preview diff** (what would merge contribute?):
  - `merge-tree --write-tree` → `diff base treeSha` _(fallback: three-dot diff)_
- **Stash “leapfrog”** (apply stash to another branch without switching your working folder):
  - `worktree add` → `stash apply` → `add` → `commit` → `worktree remove`
