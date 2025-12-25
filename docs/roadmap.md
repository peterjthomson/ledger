# Roadmap

## Current Version: 0.1.0 (MVP)

### ✅ Completed Features

- [x] Repository selection with folder picker
- [x] Persistent storage of last used repo
- [x] Branch listing (local + remote) with metadata
- [x] Worktree listing and navigation
- [x] Pull request listing via GitHub CLI
- [x] Filter branches: All, Local Only, Unmerged
- [x] Sort branches: Name, Last Commit, First Commit, Most Commits
- [x] Double-click actions (switch branch, open worktree, view PR)
- [x] Right-click context menus
- [x] Auto-stash before destructive operations
- [x] Status toasts for feedback
- [x] Mac native light theme
- [x] Apple Silicon DMG distribution
- [x] E2E test suite

---

## v0.2.0 - Enhanced Navigation

### Branch Management
- [ ] Create new branch from current HEAD
- [ ] Delete local branch (with confirmation)
- [ ] Rename local branch
- [ ] Merge branch into current

### Worktree Management
- [ ] Create new worktree
- [ ] Remove worktree
- [ ] Prune stale worktrees

### Stash Management
- [ ] View stash list
- [ ] Apply/pop stash
- [ ] Drop stash
- [ ] Create named stash

---

## v0.3.0 - Commit Viewer

### Commit History
- [ ] Show commit log for selected branch
- [ ] Commit details (message, author, date, diff stats)
- [ ] Copy commit hash
- [ ] Cherry-pick commit

### Diff Viewer
- [ ] View uncommitted changes
- [ ] View diff between branches
- [ ] Syntax highlighting

---

## v0.4.0 - Multi-Repo Support

### Repository Management
- [ ] Recent repositories list
- [ ] Pin favorite repositories
- [ ] Quick switch between repos
- [ ] Repository groups/folders

### Tabs/Windows
- [ ] Multiple repo tabs
- [ ] Detach tab to new window

---

## v0.5.0 - Git Operations

### Staging & Committing
- [ ] Stage/unstage files
- [ ] Commit with message
- [ ] Amend last commit
- [ ] Interactive staging (hunks)

### Remote Operations
- [ ] Push to remote
- [ ] Pull with rebase option
- [ ] Fetch all remotes
- [ ] Remote management

---

## v0.6.0 - Enhanced PR Integration

### GitHub Integration
- [ ] PR details panel (description, comments, reviews)
- [ ] PR review status badges
- [ ] Create PR from branch
- [ ] PR templates

### GitLab/Bitbucket Support
- [ ] GitLab MR integration
- [ ] Bitbucket PR integration
- [ ] Generic git forge detection

---

## Future Considerations

### Performance
- [ ] Lazy loading for large repos
- [ ] Background refresh
- [ ] Caching for metadata

### UX Improvements
- [ ] Keyboard shortcuts
- [ ] Search/filter branches by name
- [ ] Customizable columns
- [ ] Dark theme option

### Platform
- [ ] Intel Mac build
- [ ] Windows support
- [ ] Linux support
- [ ] Auto-updater

### Integration
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

