# Roadmap

This roadmap is **capability-based** (not version-based) to avoid coupling docs to release numbers.

### ✅ Shipped / Working Today

**Branch Management**
- [x] Branch listing (local + remote) with metadata
- [x] Filter branches: All, Local Only, Unmerged
- [x] Sort branches: Name, Last Commit, First Commit, Most Commits
- [x] Create new branch from current HEAD
- [x] Push branch to remote
- [x] Auto-stash before destructive operations

**Pull Request Integration**
- [x] PR listing via GitHub CLI
- [x] PR filtering: All, Open (not draft), Drafts only
- [x] PR sorting: Updated, Comments, First/Last commit
- [x] PR details panel (description, comments, reviews)
- [x] PR review status badges
- [x] Create PR from branch
- [x] Checkout PR branches

**Worktree Support**
- [x] Worktree listing and navigation
- [x] Agent workspace detection (Cursor, Claude, etc.)
- [x] Worktree change stats
- [x] Convert worktree to branch

**Commit & Staging**
- [x] Commit log for current branch
- [x] Commit details (message, author, date, diff stats)
- [x] View uncommitted changes
- [x] Stage/unstage files
- [x] Commit with message

**Stash Management**
- [x] View stash list
- [x] Apply/pop stash
- [x] Drop stash
- [x] Convert stash to branch

**Infrastructure**
- [x] Repository selection with folder picker
- [x] Persistent storage of last used repo
- [x] Status toasts for feedback
- [x] Mac native light theme
- [x] Apple Silicon DMG distribution
- [x] E2E test suite

---

## Next

### Branch Management
- [ ] Delete local branch (with confirmation)
- [ ] Rename local branch
- [ ] Merge branch into current

### Worktree Management
- [ ] Create new worktree
- [ ] Remove worktree (with confirmation)
- [ ] Prune stale worktrees

### UX Improvements
- [ ] Keyboard shortcuts
- [ ] Dark theme option
- [ ] Loading skeletons (instead of "Loading..." text)

---

## Later

### Enhanced Commit View
- [ ] Syntax highlighting in diffs
- [ ] Cherry-pick commit
- [ ] Amend last commit
- [ ] Interactive staging (hunks)

### Remote Operations
- [ ] Pull with rebase option
- [ ] Fetch all remotes
- [ ] Remote management

---

## Future

### Multi-Repo Support
- [ ] Recent repositories list
- [ ] Pin favorite repositories
- [ ] Quick switch between repos
- [ ] Repository groups/folders
- [ ] Multiple repo tabs

---

## Future Considerations

### Performance
- [ ] Lazy loading for large repos
- [ ] Background refresh
- [ ] Caching for metadata

### Platform Support
- [ ] Intel Mac build
- [ ] Windows support
- [ ] Linux support
- [ ] Auto-updater
- [ ] Code signing

### Integration
- [ ] GitLab MR integration
- [ ] Bitbucket PR integration
- [ ] Terminal integration (open in iTerm/Terminal)
- [ ] Editor integration (open in VS Code/Cursor)
- [ ] Notification center integration

---

## Contributing

Ideas and contributions welcome! Please open an issue to discuss before submitting PRs for major features.

### Priority Labels
- `P0` - Critical / blocking
- `P1` - High priority / next release
- `P2` - Medium priority / planned
- `P3` - Low priority / nice to have
