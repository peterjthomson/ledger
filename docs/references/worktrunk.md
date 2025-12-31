# Worktrunk Reference

> Reference notes on [Worktrunk](https://github.com/max-sixty/worktrunk) — a fellow open source Rust CLI for git worktree management designed for parallel AI agent workflows. Both projects share the vision that worktrees deserve better tooling.

**Last updated:** December 2024

---

## Overview

**Worktrunk** is a CLI tool by [max-sixty](https://github.com/max-sixty) (creator of PRQL, maintainer of Xarray) that makes git worktrees as easy as branches. It's specifically designed for running AI agents (Claude Code, Codex) in parallel.

**Ledger** and Worktrunk share the same thesis:
> *"Git worktrees are native but unloved—under-metaphored and under-tooled."*

They approach it from different angles: Worktrunk is a power-user CLI, Ledger is a visual GUI.

---

## Core Commands

| Task | Worktrunk | Plain git |
|------|-----------|-----------|
| Switch worktrees | `wt switch feat` | `cd ../repo.feat` |
| Create + start Claude | `wt switch -c -x claude feat` | `git worktree add -b feat ../repo.feat && cd ../repo.feat && claude` |
| Clean up | `wt remove` | `cd ../repo && git worktree remove ../repo.feat && git branch -d feat` |
| List with status | `wt list` | `git worktree list` (paths only) |

---

## Feature Comparison

### Shared Features ✅

| Feature | Worktrunk | Ledger |
|---------|-----------|--------|
| Worktree listing | `wt list` | Visual worktrees column |
| Create worktree | `wt switch -c` | Create Worktree panel |
| Remove worktree | `wt remove` | Context menu action |
| Agent detection | Cursor, Claude | Cursor, Claude, Gemini, Conductor, Junie |
| Diff stats | In list output | Per-worktree badges |
| Smart naming | Branch-based | `"Cursor 1: AuthController"` format |

### Worktrunk Features Worth Exploring ⭐

| Feature | Description | Priority |
|---------|-------------|----------|
| **Hooks system** | `on create`, `pre-merge`, `post-merge` hooks | High |
| **`wt merge` workflow** | Squash, rebase, merge, clean up in one command | High |
| **LLM commit messages** | Generate commit messages from diffs via `llm` | High |
| **Shell integration** | `wt switch` changes directory automatically | N/A (CLI-only) |
| **fzf-like selector** | Fuzzy finder for quick switching | Medium |
| **CI status in list** | Shows CI status inline | Medium |

### Ledger's Unique Strengths ✨

| Feature | Description |
|---------|-------------|
| **Visual UI** | Full GUI with multi-column layout |
| **Agent task hints** | Reads Cursor transcripts to show what AI is working on |
| **PR integration** | PRs alongside worktrees in unified view |
| **Leapfrog stash** | Apply stash to non-current branch via worktrees |
| **Convert to branch** | Extract worktree changes into proper branch |
| **Activity status** | `active`, `recent`, `stale` freshness tracking |
| **Diff visualization** | Syntax-highlighted file diffs |

---

## Key Insights from Worktrunk

### 1. Hooks Are Essential

Worktrunk's hook system enables automation:

```yaml
# Example hook workflow
on_create:
  - npm install
  - cp .env.example .env
pre_merge:
  - npm test
post_merge:
  - cleanup script
```

**Ledger opportunity:** Add `.ledger/config.json` for project-level hooks.

### 2. The "Merge" Workflow is Underserved

Worktrunk's `wt merge` combines multiple steps:
1. Squash/rebase/merge commits
2. Push to remote
3. Create PR (optional)
4. Clean up worktree
5. Delete branch

**Ledger opportunity:** Add "Finalize Worktree" action combining these steps.

### 3. LLM Integration is Expected

AI-first tools should dogfood AI features. Worktrunk generates commit messages via the `llm` CLI.

**Ledger opportunity:** "Suggest Message" button in staging panel.

---

## How They Complement Each Other

| | Worktrunk | Ledger |
|-|-----------|--------|
| **Form factor** | CLI | GUI |
| **Target user** | Power users, terminal-native | Visual learners, GUI-preferring |
| **Strength** | Speed, composability, shell integration | Visualization, PR integration, low barrier |
| **Trade-off** | No visual overview | Can't change user's terminal directory |

**They serve different workflows.** A sophisticated setup might:
1. Use `wt switch -c feat --execute claude` to launch an agent
2. Use Ledger to monitor multiple worktrees visually
3. Use Ledger's PR integration to review and merge

---

## Recommendations for Ledger

### Priority 1: Learn From These Features

1. **Project hooks config** — `.ledger/config.json` with `copyFiles`, `postCreate`, `preRemove`
2. **LLM commit suggestions** — "Suggest Message" in staging panel
3. **Unified "Finalize Worktree"** — Create PR + clean up in one action

### Priority 2: Maintain Differentiation

- Keep visual richness (Ledger's moat)
- Deepen agent transcript integration (unique to Ledger)
- Show PR status on worktree cards

### Priority 3: Consider Later

- `Cmd+K` command palette with fuzzy search
- Detect Worktrunk and offer to open `wt` commands for power users

---

## Links

- **GitHub:** https://github.com/max-sixty/worktrunk
- **Documentation:** https://worktrunk.dev
- **Author:** [@max_sixty](https://github.com/max-sixty) (also created PRQL)

### Related Reading

- [Claude Code Best Practices](https://docs.anthropic.com/en/docs/claude-code) — Anthropic's guide including worktree patterns
- [Shipping faster with Claude Code and Git Worktrees](https://incident.io/blog) — incident.io's workflow
- [Git worktree pattern discussion](https://github.com/anthropics/claude-code/discussions) — Community discussion

---

## Appendix: Worktrunk Demo

From the README:

```
Worktrunk Demo

Worktrunk omnibus demo: multiple Claude agents in Zellij tabs 
with hooks, LLM commits, and merge workflow
```

The demo shows:
- Multiple agents running in parallel tabs
- Auto-generated commit messages
- One-command merge + cleanup workflow

