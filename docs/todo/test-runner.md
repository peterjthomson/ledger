# Test Runner (Planned)

Status: Proposal

## Goal

Run tests for branches and PRs without switching the working directory, using the same worktree strategy as previews.

## Intended Behavior

- Create or reuse a worktree for the branch/PR.
- Reuse dependency symlinks to avoid slow installs.
- Execute the test command and capture stdout/stderr.
- Surface a pass/fail summary with the run output.

## Direction (Not Implemented)

- Provider-based detection similar to previews (Laravel/Rails/Node).
- No IPC channels or UI wired up yet.
- Avoid hardcoding commands; detect per project.

## Open Questions

- How to isolate databases safely for parallel runs.
- How to cancel long-running test processes.
- Where results should live in the UI (panel vs toast vs history).
