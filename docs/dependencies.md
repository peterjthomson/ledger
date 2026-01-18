# Dependencies

## Runtime Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `electron` | 37.x | Desktop app framework |
| `simple-git` | 3.x | Git operations (branch, checkout, worktree, etc.) |
| `@electron-toolkit/preload` | 3.x | Preload script utilities |
| `@electron-toolkit/utils` | 4.x | Electron app utilities |
| `zustand` | 5.x | Lightweight shared UI state store |

### AI (optional)

These SDKs are only used when a user enables an AI provider. The core app does not require them for standard git workflows.

| Package | Version | Purpose |
|---------|---------|---------|
| `openai` | 6.x | OpenAI and OpenRouter client |
| `@anthropic-ai/sdk` | 0.50.x | Anthropic client |
| `@google/generative-ai` | 0.21.x | Gemini client |

### UI (bundled into renderer)

| Package | Version | Purpose |
|---------|---------|---------|
| `react` | 19.x | UI framework |
| `react-dom` | 19.x | React DOM renderer |
| `lucide-react` | 0.5x | Icon set used in the UI and plugins |
| `framer-motion` | 12.x | Animations (optional, light usage) |

### Styling

| Package | Version | Purpose |
|---------|---------|---------|
| `tailwindcss` | 4.x | Utility classes in shared UI components (app is mostly custom CSS) |
| `clsx` | 2.x | Conditional class names |
| `tailwind-merge` | 3.x | Merge Tailwind classes |

### Validation

| Package | Version | Purpose |
|---------|---------|---------|
| `zod` | 4.x | Schema validation (for Conveyor IPC) |

## Development Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `electron-vite` | 4.x | Build tool (Vite for Electron) |
| `electron-builder` | 26.x | App packaging and distribution |
| `vite` | 7.x | Frontend build tool |
| `typescript` | 5.x | Type checking |
| `@playwright/test` | 1.x | E2E testing |

### Linting & Formatting

| Package | Version | Purpose |
|---------|---------|---------|
| `eslint` | 9.x | Code linting |
| `prettier` | 3.x | Code formatting |
| `typescript-eslint` | 8.x | TypeScript ESLint rules |

## External Tools (not npm packages)

| Tool | Required | Purpose |
|------|----------|---------|
| `git` | Yes | Core functionality |
| `gh` (GitHub CLI) | Optional | Pull request integration |

### Installing GitHub CLI

```bash
# macOS
brew install gh

# Then authenticate
gh auth login
```

## Dependency Graph

```
Ledger App
├── Electron (runtime)
│   ├── Main Process
│   │   ├── simple-git (git operations)
│   │   └── Node.js fs (settings storage)
│   └── Renderer Process
│       ├── React (UI)
│       └── CSS (styling)
│
├── Build Tools
│   ├── electron-vite (dev server, build)
│   ├── vite (bundling)
│   └── electron-builder (packaging)
│
└── External
    ├── git (CLI)
    └── gh (CLI, optional)
```

## Updating Dependencies

```bash
# Check for outdated packages
npm outdated

# Update all to latest (minor/patch)
npm update

# Update to latest major versions
npx npm-check-updates -u
npm install
```

## Security Notes

- `simple-git` executes git commands against user-selected repos
- `gh` CLI is called via `child_process.exec` for PR data
- Network access is limited to `gh` and optional AI providers (only when enabled)
- Settings stored locally in `~/Library/Application Support/ledger/`

