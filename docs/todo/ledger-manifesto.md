# Ledger

**The local control plane for agentic development.**

---

## The Problem

Development has changed. Claude Code spins up worktrees for parallel tasks. Cursor does the same. Suddenly you have 6 worktrees you half-forgot about, each with uncommitted changes, a Herd site still running, a database that may or may not exist, and an agent that may or may not still be working on it.

There's no single place to see "what's actually running on my machine right now."

Meanwhile:
- GitHub's web UI is too slow to innovate — designed for occasional use, not power users
- Git GUIs treat worktrees as a power-user footnote
- Local dev environment tools (Herd, Valet) assume manual site management
- PR reviews are drowning in bot comments (CodeRabbit, Copilot) with human voice buried
- Git Butler is solving parallel workflows but with a proprietary virtual branch model, not standard git

Nobody has connected the pieces: **worktrees + running environments + agent awareness + PR management**.

---

## The Vision

Ledger is a fast iteration sandbox for source code in the agentic era.

Not "a git GUI" — there's plenty of those.
Not "GitHub but local" — that's too small.

It's the **local control plane** for a world where:
- Code is being written in parallel by multiple agents
- Each branch is a running environment, not just files
- PRs have more bot comments than human ones
- You need to see and manage all of this in real-time

---

## Core Concepts

### Worktree-First Architecture

Every worktree becomes a runnable environment — not just code sitting on disk, but an actual running instance.

| Current World | Ledger World |
|---------------|--------------|
| Worktree = files on disk | Worktree = running system |
| Manual `herd link` | One-click environment setup |
| Forget what's running | Unified dashboard |
| Cleanup is manual | One-button teardown |

### Agent Awareness

Detect and display agent activity:
- **Claude Code** — `.claude/` artifacts, running processes
- **Cursor** — workspace state in config directories  
- **Aider** — `.aider*` files

Show "an agent touched this recently" as valuable context when you're trying to remember what state things are in.

### Human-First PR Reviews

The signal-to-noise ratio has collapsed. PRs that used to have 3 human comments now have 50+ automated ones.

Default view:
```
[ ] AI comments (43)
[x] Human comments (2)
[x] Human approvals (1)
```

Features:
- Comment attribution badges (CodeRabbit vs Copilot vs human)
- AI comment summary ("3 security, 12 style, 28 nitpicks")
- Human-needs-response surfacing
- Consensus view ("2 AIs approved, 1 human requested changes")

### Spatial Code Understanding

WinDirStat/GrandPerspective for code. Treemap visualization where each file is a rectangle, sized by lines of code, colored by:

| Color Mode | Value |
|------------|-------|
| Language | PHP blue, JS yellow, CSS green |
| Churn | Hot red = changed often, cold blue = stable |
| Age | Recent = bright, old = faded |
| Agent activity | Highlight files agents touched this session |
| Test coverage | Green = covered, red = not |

When an agent is working on a PR, see the codebase with files being modified pulsing or highlighted. Instantly grasp "this PR touches auth, payments, and tests."

---

## The Unified View

| Worktree | Branch | Agent Status | Local Site | Database | Uncommitted? |
|----------|--------|--------------|------------|----------|--------------|
| /pr-123 | feature/x | Claude Code (idle) | pr-123.test | pr_123 | 3 files |
| /pr-456 | fix/y | — | pr-456.test | pr_456 | clean |
| /main | main | Cursor (active) | icehouse.test | icehouse | 1 file |

---

## Key Workflows

### PR Review Flow

1. See a PR in Ledger
2. One click: worktree created, Herd spins up site, database cloned/migrated
3. Browse the actual feature at `pr-1234.test`
4. Review with human comments surfaced, AI noise filtered
5. Done reviewing? One button: teardown everything

### Environment Orchestration

**Up:**
```
PR opened → create worktree → herd link → copy .env → migrate → open browser
```

**Down:**
```
Check uncommitted (warn/stash) → kill processes → remove site → drop database → delete worktree → optionally prune remote branch
```

### Agent Watch Mode

A `htop` for your agentic worktrees:
- Which agents are active
- What they're doing
- Resource usage
- Recent commits

---

## Technical Architecture

### Stack Decision: Electron + TypeScript + React

Why not Swift:
- Acquisition target (Cursor, etc.) wants code they can absorb
- AI tooling companies (OpenCode, DevRamp) have TypeScript engineers
- VS Code extension shares components
- Community contributions require accessible tech

The play:
1. **VS Code extension** — distribution, visibility, where developers already are
2. **Electron standalone app** — power users who want full experience
3. **Shared component library** — treemap, PR filtering, worktree management

### Git Operations

Shell out to `git` CLI — not libgit2. Simpler, automatic compatibility with new git features, negligible performance overhead for interactive use.

Use `simple-git` npm package as the wrapper.

### Environment Integration

Call Herd/Valet CLI directly:
- `herd link`, `herd secure`
- `valet link`, `valet secure`

Database handling options (configurable per-repo):
1. Snapshot/clone from main
2. Fresh migrate + seed
3. Shared read-only database

### PR Comments

GitHub GraphQL API for efficient bulk fetching. Bot detection via `type === "Bot"` or `login.endsWith("[bot]")`.

Known bots:
- `coderabbitai[bot]`
- `copilot-pull-request-reviewer[bot]`
- `dependabot[bot]`
- `renovate[bot]`
- `sonarcloud[bot]`

---

## Starting Point

Clone a modern Electron + React + TypeScript boilerplate:

```bash
git clone https://github.com/guasam/electron-react-app.git ledger
cd ledger
npm install
npm install simple-git
npm run dev
```

Reference code to steal from:
- **GitHub Desktop** — diff rendering, commit history components
- **Lazygit** — interaction patterns, keyboard-first UX
- **SourceGit** — graph layout algorithms

---

## Differentiation

| | Git Butler | Ledger |
|---|-----------|--------|
| Branch model | Virtual branches (proprietary) | Worktrees (standard git) |
| Agent compatibility | Unknown | Native (agents already use worktrees) |
| Local environment | Not addressed | Herd/Valet integration |
| Learning curve | New concepts | Git concepts you know |
| PR management | Not addressed | Human vs AI filtering |

| | GitHub Web | Ledger |
|---|------------|--------|
| Speed | Click, wait, scroll | Keyboard-first, instant |
| Environment | Codespaces (30s spin-up) | Worktree exists, Herd running |
| Testing | Actions, wait | Local environment, instant |
| Context switching | New tab, reload | Switch worktrees instantly |
| View | One PR at a time | All active work simultaneously |

---

## Competitive Moat

GitHub could theoretically build this. But they won't because:
1. Requires local tooling (against their cloud model)
2. Power-user focused (small market to them)
3. Assumes agents as first-class (too early for them to commit)

Ledger is building for where development is going, not where it's been.

---

## Acquisition Path

Target: **Cursor** (or similar AI-native IDE)

What they'd want:
| Asset | How Ledger delivers |
|-------|---------------------|
| User base | Developers using this daily |
| Novel UX patterns | Agent+worktree+environment solved |
| Team | Acqui-hire value |
| Tech integration | TypeScript codebase drops into their Electron app |

Strategy:
- Build best worktree management for agentic coding
- Get 10k+ developers using it daily
- Make Cursor users ask "why doesn't Cursor have this?"
- Keep codebase in TypeScript they can absorb

---

## Roadmap

### Phase 1: Foundation
- [ ] Electron app shell with React + TypeScript
- [ ] Basic worktree list view
- [ ] Git operations via simple-git
- [ ] Herd/Valet integration (link/unlink)

### Phase 2: Core Value
- [ ] One-click worktree + environment setup
- [ ] One-click teardown
- [ ] Uncommitted changes detection
- [ ] Basic commit/push workflow

### Phase 3: Agent Awareness
- [ ] Claude Code detection
- [ ] Cursor detection
- [ ] Aider detection
- [ ] Agent activity indicators in UI

### Phase 4: PR Management
- [ ] GitHub PR fetching
- [ ] Comment rendering with bot/human filtering
- [ ] Review status display
- [ ] PR-to-worktree linking

### Phase 5: Visualization
- [ ] Treemap view of codebase
- [ ] LOC-based sizing
- [ ] Churn/age/agent coloring
- [ ] File selection → detail view

### Phase 6: VS Code Extension
- [ ] Shared component extraction
- [ ] Extension scaffolding
- [ ] Worktree panel in VS Code
- [ ] PR comments panel

### Phase 7: Scale
- [ ] Multi-repo support
- [ ] Team features
- [ ] GitLab/Bitbucket support
- [ ] Custom agent detection plugins

---

## Name

**Ledger**

Why:
- Easy to type (unlike "Canopy")
- Strong metaphor — authoritative record of what happened
- Tracks who did what (agents vs humans)
- Immutable history
- Git is literally a ledger (distributed append-only log)
- Sounds like infrastructure, like a company
- Works in acquisition/investor/enterprise conversations

---

## The Manifesto

Git turned 20. Developers are still confused by its intricacy. Three of the top 5 Stack Overflow questions of all time are Git related.

Now add AI agents writing code in parallel across multiple worktrees, automated reviewers flooding PRs with comments, and local environments that need orchestration.

The tools haven't caught up.

Ledger is the answer: a fast, local control plane that treats worktrees as running environments, agents as first-class participants, and human attention as the scarce resource it is.

**See everything. Run anything. Ship faster.**

---

*Built for the agentic era.*
