# Ledger Security Architecture

This document describes the security architecture of the Ledger application, including Electron sandbox configuration, IPC security, command injection prevention, and plugin permission system.

## Electron Security Configuration

### Sandbox and Context Isolation

Ledger uses Electron's security best practices with explicit configuration in `lib/main/app.ts`:

Key settings applied:
- Sandbox is enabled to keep renderer processes constrained.
- Context isolation is enabled so preload runs in a separate context.
- Node.js integration is disabled in renderers and workers.
- Web security (same-origin policy) is enforced.

**Why these settings matter:**

- **`sandbox: true`**: Enables Chromium's OS-level sandboxing, restricting what the renderer process can access
- **`contextIsolation: true`**: Runs preload scripts in an isolated context, preventing renderer code from accessing Node.js APIs or modifying preload globals
- **`nodeIntegration: false`**: Prevents renderer code from accessing Node.js APIs directly
- **`webSecurity: true`**: Enforces same-origin policy, preventing cross-origin requests

### Runtime Security Assertion

The preload script (`lib/preload/preload.ts`) performs a runtime check to warn if context isolation is unexpectedly disabled.

### Content Security Policy

The application uses a restrictive CSP in `app/index.html`:

The policy restricts scripts to `self`, limits styles to `self` (plus inline for app styles), and only allows images from `self`, `data:`, and `res:`.

This prevents:
- Loading scripts from external sources
- Inline script execution (except trusted preload)
- Loading resources from unauthorized origins

## IPC Architecture

### Secure Communication Pattern

All renderer-to-main process communication uses `ipcRenderer.invoke()` with typed channels:

Patterns:
- Preload exposes a narrow, versioned API surface via `contextBridge` (`lib/preload/preload.ts`).
- Main process handlers validate all inputs with Zod schemas (`lib/conveyor/schemas`, `lib/conveyor/handlers`).

### Error Handling

IPC handlers use safe error serialization (`lib/utils/error-helpers.ts`) to prevent leaking sensitive information:
Errors are normalized to safe, serializable messages before crossing the process boundary.

## Command Injection Prevention

### Safe Shell Execution

The application uses `safeExec()` (`lib/utils/safe-exec.ts`) for all shell commands:
It always uses argv-style invocation (no shell interpolation) and sets explicit timeouts to reduce risk.

**Key security feature:** `shell: false` ensures arguments are passed directly to the process without shell interpretation, preventing injection attacks.

### Input Validation

#### NPM Package Names

Validated against strict npm naming rules to prevent shell metacharacters and traversal.

#### Git URLs

Validated against strict HTTPS/SSH patterns to prevent command substitution and malformed URLs.

### Path Traversal Prevention

File path operations validate against directory traversal attacks:
Paths are normalized, checked for traversal sequences, and required to be absolute before use.

### Protected Operations

| Operation | Protection Method |
|-----------|-------------------|
| Plugin git clone | simple-git library (no shell) |
| NPM pack | safeExec + validation |
| PR create/comment | safeExec (args array) |
| PR merge | safeExec (args array) |
| Open URL | safeExec (URL as single arg) |
| Worktree creation | Path traversal validation |

## Plugin Permission System

### Permission Types

Permissions are explicit and granular, including: `git:read`, `git:write`, `fs:read`, `fs:write`, `network`, `shell`, `clipboard`, and `notifications`.

### Permission Request Flow

1. Plugin declares required permissions in manifest
2. During activation, `pluginLoader.requestPermissions()` is called
3. UI displays `PermissionDialog` with risk levels
4. User approves/denies specific permissions
5. Approved permissions stored in `pluginRegistry`
6. `PluginAPI` methods check permissions before execution

### Permission Enforcement

Plugin API methods in `lib/plugins/plugin-context.ts` check permissions:
Calls are gated at the API boundary so unapproved permissions are denied before any side effects.

### Trust Levels

- **Built-in plugins**: Auto-approved (trusted source)
- **Local plugins**: Require user approval
- **External plugins (git/npm)**: Require user approval + high-risk warning

## Security Best Practices

### For Contributors

1. **Never use string interpolation for shell commands**
   - Use argv arrays with `safeExec` (no shell interpolation).

2. **Always validate external input**
   - Validate user input against strict patterns before executing commands.

3. **Use Zod schemas for IPC validation**
   - Enforce input shapes at IPC boundaries with Zod.

4. **Check permissions in plugin API methods**
   - Require explicit permissions before any privileged action.

### Security Testing

Run the validation test suite:
`npm test -- tests/validation.spec.ts`

Tests cover:
- NPM package name validation
- Git URL validation
- Safe execution patterns
- Error serialization

## Reporting Security Issues

If you discover a security vulnerability, please report it privately to the maintainers rather than opening a public issue.
