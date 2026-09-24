# Contributing to Ledger

Thank you for your interest in contributing to Ledger! This document provides guidelines and information for contributors.

## Getting Started

### Prerequisites

- Node.js 20.19+ (see `package.json`)
- npm 9+
- macOS for the local Electron and packaging workflow described below
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
| `lib/services/` | Git operations accepting an explicit repository context |
| `lib/main/git-service.ts` | Legacy Git operations still used by some handlers |
| `lib/conveyor/` | Typed IPC schemas, handlers, and renderer APIs |
| `lib/main/main.ts` | IPC handler registration |
| `app/app.tsx` | Main React component |
| `app/types/electron.d.ts` | TypeScript types for IPC |

### Adding a Git Operation

1. Add the operation to the appropriate module in `lib/services/`, accepting a repository context.
2. Define its Zod arguments and result in `lib/conveyor/schemas/`.
3. Add its handler in `lib/conveyor/handlers/` and API method in `lib/conveyor/api/`.
4. Call the typed `window.conveyor` API from the renderer.

Some existing handlers still use `lib/main/git-service.ts` and the legacy `window.electronAPI`. When fixing both paths, share pure helpers instead of copying behavior. Staging uses the shared diff parser and partial-patch builder in `lib/services/staging/`.

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
# Build and run app regressions and focused Git tests
npm test

# Run tests with visible browser
npm run test:headed
```

Tests use Playwright and live in `tests/`. App tests use Electron; focused Git tests use disposable repositories and verify the resulting file/index contents. Keep tests tied to observable behavior and use explicit expected results. Avoid duplicating the implementation in assertions.

After changing app code, `npm test` builds before running the suite. For a focused run:

```bash
npm run vite:build:app
npx playwright test tests/open-issues.spec.ts tests/partial-patch.spec.ts
```

Selector guidance:
- Prefer user-facing selectors (role, text, label) where possible.
- Use `data-testid` sparingly and only when other selectors would be brittle or ambiguous.
- Avoid adding new `data-testid` attributes unless they materially improve test stability.

### Packaged-app smoke test

Packaging tests are excluded from the normal suite. Build an unsigned local macOS package, then test the actual executable:

```bash
npm run vite:build:app
npx electron-builder --mac --dir -c.mac.identity=null -c.mac.notarize=false \
  -c.directories.output=wip/package-check --publish never
LEDGER_PACKAGED_EXECUTABLE="$PWD/wip/package-check/mac-arm64/Ledger.app/Contents/MacOS/Ledger" \
  npm run test:packaged
```

The smoke test checks startup, bundled module resolution, and a native SQLite query from outside the checkout. It fails immediately if the executable path is missing or invalid. A passing macOS run does not establish Linux or Windows compatibility; run the packaged test on each release platform.

### Typechecking

`npm run typecheck` checks all application, shared, configuration, and test sources once using the single `tsconfig.json`. Electron main/preload, renderer, and tests share IPC and model types, so overlapping project references are unnecessary. Strict null checks, unused checks, and return-path checks remain enabled. The `previte:build:app` hook requires a clean typecheck before production builds, tests, or release packaging through npm scripts. Type errors must be fixed rather than suppressed or excluded.


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

Git operations use `simple-git` and targeted Git subprocesses in `lib/services/` and the legacy `lib/main/git-service.ts`. PR operations use GitHub CLI (`gh`).

## Questions?

- Open an issue for bugs or feature requests
- Discussions for general questions
- Check existing issues before creating new ones

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
