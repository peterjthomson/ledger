# Atomic Units

Ledger is an opinionated layer over Git that seeks to **rethink Git for better onboarding**, more consistent concepts, and more flexible collaboration with agents.

Git's power comes with complexity. Three of the top 5 Stack Overflow questions of all time are Git-related. Ledger introduces a unified mental model where all "work units" share common actions—making Git approachable for new developers and predictable for AI agents.

---

## The Mental Model

In traditional Git, similar concepts have wildly different commands:

- Want to see changes? It's `git diff` for branches, `git stash show` for stashes, `gh pr diff` for PRs
- Want to bring changes into your working directory? It's `git merge` for branches, `git stash pop` for stashes, or clicking "Merge" on GitHub for PRs
- Want to delete something? `git branch -d`, `git stash drop`, `gh pr close`—all different verbs

**Ledger's insight:** These are all the same operation applied to different containers of work.

---

## Work Units

| Unit | What It Is | Traditional Git Representation |
|------|------------|-------------------------------|
| **PR** | A proposed set of changes with discussion | GitHub Pull Request (not native Git) |
| **Branch** | A named pointer to a commit | `refs/heads/*` or `refs/remotes/*` |
| **Stash** | Temporarily shelved changes | `refs/stash` with reflog entries |
| **Worktree** | A separate working directory | `git worktree` linked directories |

---

## Common Actions Matrix

This table maps Ledger's unified actions to their traditional Git/GitHub equivalents:

| Action | PR | Branch (Local) | Branch (Remote) | Stash | Worktree |
|--------|----|--------------|--------------------|-------|----------|
| **Checkout** | `gh pr checkout #N`<br>*or*<br>`git fetch origin <branch>`<br>`git checkout -b <branch> origin/<branch>` | `git checkout <branch>`<br>*or*<br>`git switch <branch>` | `git checkout -b <local> --track origin/<branch>` | `git stash apply stash@{N}`<br>*(applies to current branch)* | `cd <worktree-path>`<br>*(already a separate checkout)* |
| **Merge** | `gh pr merge #N --merge`<br>*or*<br>`git merge <pr-branch>` | `git merge <branch>` | `git fetch origin <branch>`<br>`git merge origin/<branch>` | `git stash pop stash@{N}`<br>*(apply + delete)* | *Copy changes manually*<br>*or Ledger's "Convert to Branch"*<br>*(creates patch, applies to new branch)* |
| **Diff** | `gh pr diff #N`<br>*or*<br>`git diff main...<pr-branch>` | `git diff main...<branch>`<br>*(three-dot shows divergence)* | `git diff HEAD...origin/<branch>` | `git stash show -p stash@{N}` | `git -C <path> diff HEAD`<br>*(diff in that worktree)* |
| **Delete** | `gh pr close #N`<br>*(closes without merging)* | `git branch -d <branch>`<br>*(`-D` for force)* | `git push origin --delete <branch>` | `git stash drop stash@{N}` | `git worktree remove <path>` |
| **View** | `gh pr view #N`<br>*(opens in browser or shows details)* | `git log <branch>`<br>`git show <branch>` | `git log origin/<branch>` | `git stash show stash@{N}`<br>`git stash list` | `git worktree list` |
| **Create** | `gh pr create --title "..." --body "..."` | `git checkout -b <branch>`<br>*or*<br>`git branch <branch>` | `git push -u origin <branch>` | `git stash push -m "message"` | `git worktree add <path> <branch>` |
| **Push** | *(PR is remote-first)* | `git push origin <branch>` | *(already remote)* | *(stashes are local-only)* | `git -C <path> push`<br>*(push from worktree)* |

---

## Ledger's Unified Language

Ledger uses consistent verbs across all work units:

| Ledger Term | What It Means |
|-------------|---------------|
| **Checkout** | Make this the active context (switch to it, apply it, open it) |
| **Merge** | Bring these changes into your current work |
| **Diff** | Show what's different from the baseline |
| **Delete** | Remove this work unit |
| **View** | Inspect details without changing state |
| **Convert** | Transform one work unit into another |

---

## Conversion Operations

One of Ledger's key features is converting between work unit types:

| From → To | Traditional Git Commands | Ledger Operation |
|-----------|-------------------------|------------------|
| **Stash → Branch** | `git stash branch <name> stash@{N}` | "Stash to Branch" |
| **Worktree → Branch** | *Complex: create patch, switch to main, create branch, apply patch, commit* | "Convert to Branch" (one click) |
| **Branch → PR** | `git push -u origin <branch>`<br>`gh pr create` | "Create PR" |
| **PR → Branch** | `gh pr checkout #N` *(creates local tracking branch)* | "Checkout" |

---

## Why This Matters for Agents

AI coding agents (Claude Code, Cursor, Aider) work best with:

1. **Consistent interfaces** — Same action names, predictable behavior
2. **Clear state transitions** — Know what "checkout" means regardless of context
3. **Unified error handling** — Same pattern for all operations

When an agent wants to "look at the changes in X", it shouldn't need to know if X is a branch, stash, PR, or worktree—the action is "diff" in all cases.

---

## Quick Reference for New Developers

### "I want to work on this"
→ **Checkout** (works for PRs, branches, stashes)

### "I want to bring these changes into my code"
→ **Merge** (works for PRs, branches, stashes, worktrees)

### "I want to see what changed"
→ **Diff** (works for everything)

### "I'm done with this"
→ **Delete** (works for everything)

---

## Implementation Notes

Ledger implements these actions via:

| Operation | Implementation |
|-----------|----------------|
| Git operations | `simple-git` npm package |
| PR operations | GitHub CLI (`gh`) shelling out |
| Worktree operations | Native Git worktree commands |
| Stash operations | Native Git stash commands |

See `lib/main/git-service.ts` for the full implementation of all operations.

---

## The Philosophy

> Git is a powerful content-addressable filesystem with a VCS built on top. Ledger doesn't hide Git—it **organizes** it around human (and agent) workflows.

Traditional Git optimizes for:
- Correctness over convenience
- Flexibility over consistency
- Power users over beginners

Ledger optimizes for:
- **Consistent mental models** — Same verbs, predictable behavior
- **Agent collaboration** — Clear interfaces for AI assistants
- **Onboarding** — New developers can be productive immediately
- **Parallel workflows** — Multiple work units active simultaneously

---

*Built for the agentic era.*
