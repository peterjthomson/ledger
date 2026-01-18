# Contributing to Ledger

Thank you for your interest in contributing to Ledger! This document provides guidelines and information for contributors.

## Getting Started

### Prerequisites

- Node.js 18+
- npm 9+
- macOS (for development, as the app is currently macOS-only)
- [GitHub CLI](https://cli.github.com/) (`gh`) - for PR integration features

### Setup

```bash
# Clone the repository
git clone https://github.com/peterjthomson/ledger.git
cd ledger

# Install the dependencies
npm install

# Start development server
npm run dev
```

## Development

### Project Structure

```
ledger/
├── app/                    # Renderer process (React UI)
│   ├── app.tsx            # Main React component
│   ├── styles/            # CSS styles
│   └── types/             # TypeScript declarations
├── lib/                    # Main process (Electron)
│   ├── main/              # Main process code
│   │   ├── main.ts        # App entry, IPC handlers
│   │   └── git-service.ts # Git operations
│   └── preload/           # Preload scripts
├── tests/                  # E2E tests (Playwright)
└── docs/                   # Documentation
```

### Key Files

| File | Purpose |
|------|---------|
| `lib/main/git-service.ts` | All git operations via `simple-git` |
| `lib/main/main.ts` | IPC handler registration |
| `app/app.tsx` | Main React component |
| `app/types/electron.d.ts` | TypeScript types for IPC |

### Adding a Git Operation

1. Add function to `lib/main/git-service.ts`
2. Add IPC handler in `lib/main/main.ts`
3. Expose in `lib/preload/preload.ts`
4. Add types to `app/types/electron.d.ts`
5. Call from `app/app.tsx`

## Code Style

### Linting & Formatting

```bash
# Run linter
npm run lint

# Format code
npm run format
```

### Guidelines

- Use TypeScript for all new code
- Use functional React components with hooks
- Prefix unused variables with `_` (e.g., `_error`)
- Follow existing patterns in the codebase
- Add JSDoc comments for public functions

### Naming Conventions

| Type | Convention | Example |
|------|------------|---------|
| Files | kebab-case | `git-service.ts` |
| Components | PascalCase | `BranchList.tsx` |
| Functions | camelCase | `getBranches()` |
| IPC channels | kebab-case | `get-branches` |
| Types/Interfaces | PascalCase | `BranchInfo` |

## Testing

```bash
# Run E2E tests
npm test

# Run tests with visible browser
npm run test:headed
```

Tests use Playwright and are located in `tests/`. The test suite covers:
- Welcome screen (no repo selected)
- Main view with repository

Selector guidance:
- Prefer user-facing selectors (role, text, label) where possible.
- Use `data-testid` sparingly and only when other selectors would be brittle or ambiguous.
- Avoid adding new `data-testid` attributes unless they materially improve test stability.

## Submitting Changes

### Pull Request Process

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Run tests and linting
5. Commit with a descriptive message
6. Push to your fork
7. Open a Pull Request

### Commit Messages

Follow conventional commit format:

```
type(scope): description

[optional body]
```

Types: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`

Examples:
- `feat(branches): add branch deletion support`
- `fix(pr): handle API rate limiting`
- `docs: update contributing guidelines`

### PR Checklist

- [ ] Code follows project style guidelines
- [ ] Lint passes (`npm run lint`)
- [ ] Tests pass (`npm test`)
- [ ] New features have tests
- [ ] Documentation updated if needed

## Architecture Notes

### IPC Communication

All communication between main and renderer processes uses `ipcMain.handle` / `ipcRenderer.invoke` for async request/response.

### State Management

Uses React hooks for local UI state, plus a small shared store for cross-component state and optional persistence (e.g., active panels, plugin navigation).

### Git Operations

All git commands go through `simple-git` library in `git-service.ts`. PR operations use GitHub CLI (`gh`).

## Questions?

- Open an issue for bugs or feature requests
- Discussions for general questions
- Check existing issues before creating new ones

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
