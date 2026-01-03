# Ledger Security Architecture

This document describes the security architecture of the Ledger application, including Electron sandbox configuration, IPC security, command injection prevention, and plugin permission system.

## Electron Security Configuration

### Sandbox and Context Isolation

Ledger uses Electron's security best practices with explicit configuration in `lib/main/app.ts`:

```typescript
webPreferences: {
  preload: join(__dirname, '../preload/preload.js'),
  sandbox: true,              // V8 sandbox enabled
  contextIsolation: true,     // Preload isolated from renderer
  nodeIntegration: false,     // No Node.js in renderer
  nodeIntegrationInWorker: false, // No Node.js in workers
  webSecurity: true,          // Same-origin policy enforced
}
```

**Why these settings matter:**

- **`sandbox: true`**: Enables Chromium's OS-level sandboxing, restricting what the renderer process can access
- **`contextIsolation: true`**: Runs preload scripts in an isolated context, preventing renderer code from accessing Node.js APIs or modifying preload globals
- **`nodeIntegration: false`**: Prevents renderer code from accessing Node.js APIs directly
- **`webSecurity: true`**: Enforces same-origin policy, preventing cross-origin requests

### Runtime Security Assertion

The preload script (`lib/preload/preload.ts`) includes a runtime check to catch configuration errors:

```typescript
if (!process.contextIsolated) {
  console.error('[SECURITY] Context isolation is DISABLED! This is a security risk.')
}
```

### Content Security Policy

The application uses a restrictive CSP in `app/index.html`:

```html
<meta http-equiv="Content-Security-Policy"
  content="default-src 'self'; script-src 'self';
           style-src 'self' 'unsafe-inline'; img-src 'self' data: res:;"
/>
```

This prevents:
- Loading scripts from external sources
- Inline script execution (except trusted preload)
- Loading resources from unauthorized origins

## IPC Architecture

### Secure Communication Pattern

All renderer-to-main process communication uses `ipcRenderer.invoke()` with typed channels:

```typescript
// Preload exposes limited API via contextBridge
contextBridge.exposeInMainWorld('conveyor', {
  repo: new RepoApi(),
  branch: new BranchApi(),
  // ... other APIs
})

// Main process validates all inputs with Zod schemas
handle('channel-name', async (data) => {
  const validated = schema.parse(data)
  // ... process validated data
})
```

### Error Handling

IPC handlers use safe error serialization (`lib/utils/error-helpers.ts`) to prevent leaking sensitive information:

```typescript
export function serializeError(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  if (typeof error === 'object' && error !== null && 'message' in error) {
    return String((error as { message: unknown }).message)
  }
  return 'Unknown error'
}
```

## Command Injection Prevention

### Safe Shell Execution

The application uses `safeExec()` (`lib/utils/safe-exec.ts`) for all shell commands:

```typescript
export const safeExec = async (
  command: string,
  args: string[],
  options?: { cwd?: string; timeout?: number }
): Promise<ExecResult> => {
  return new Promise((resolve) => {
    const proc = spawn(command, args, {
      cwd: options?.cwd,
      timeout: options?.timeout ?? 30000,
      shell: false,  // CRITICAL: No shell interpolation
    })
    // ...
  })
}
```

**Key security feature:** `shell: false` ensures arguments are passed directly to the process without shell interpretation, preventing injection attacks.

### Input Validation

#### NPM Package Names

```typescript
export function isValidNpmPackageName(name: string): boolean {
  return /^(@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/.test(name)
}
```

Prevents: `lodash; rm -rf /`, `$(whoami)`, backtick injection

#### Git URLs

```typescript
function isValidGitUrl(url: string): boolean {
  return /^(https:\/\/|git@)[a-zA-Z0-9.-]+[/:][a-zA-Z0-9._/-]+\.git$/.test(url)
}
```

Prevents: `https://evil.com/; rm -rf /`, command substitution

### Path Traversal Prevention

File path operations validate against directory traversal attacks:

```typescript
// Security: Validate path doesn't contain traversal attempts
const resolvedPath = path.resolve(folderPath)
if (folderPath.includes('..') || resolvedPath !== path.normalize(folderPath)) {
  return { success: false, message: 'Invalid folder path: path traversal not allowed' }
}

// Security: Ensure path is absolute to prevent relative path attacks
if (!path.isAbsolute(folderPath)) {
  return { success: false, message: 'Folder path must be absolute' }
}
```

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

```typescript
type PluginPermission =
  | 'git:read'      // Read repository info
  | 'git:write'     // Perform git operations
  | 'fs:read'       // Read files
  | 'fs:write'      // Write files
  | 'network'       // Make network requests
  | 'shell'         // Execute shell commands
  | 'clipboard'     // Access clipboard
  | 'notifications' // Show notifications
```

### Permission Request Flow

1. Plugin declares required permissions in manifest
2. During activation, `pluginLoader.requestPermissions()` is called
3. UI displays `PermissionDialog` with risk levels
4. User approves/denies specific permissions
5. Approved permissions stored in `pluginRegistry`
6. `PluginAPI` methods check permissions before execution

### Permission Enforcement

Plugin API methods in `lib/plugins/plugin-context.ts` check permissions:

```typescript
const checkPermission = (permission: PluginPermission): boolean => {
  if (!hasPermission(pluginId, permission)) {
    logger.warn(`Missing permission: ${permission}`)
    return false
  }
  return true
}

// Example: git:read required
getBranches: async () => {
  if (!checkPermission('git:read')) return []
  return deps.getBranches()
}
```

### Trust Levels

- **Built-in plugins**: Auto-approved (trusted source)
- **Local plugins**: Require user approval
- **External plugins (git/npm)**: Require user approval + high-risk warning

## Security Best Practices

### For Contributors

1. **Never use string interpolation for shell commands**
   ```typescript
   // BAD
   exec(`gh pr comment ${prNumber} --body "${body}"`)

   // GOOD
   safeExec('gh', ['pr', 'comment', prNumber.toString(), '--body', body])
   ```

2. **Always validate external input**
   ```typescript
   if (!isValidNpmPackageName(name)) {
     return { success: false, message: 'Invalid package name' }
   }
   ```

3. **Use Zod schemas for IPC validation**
   ```typescript
   const schema = z.object({
     path: z.string().min(1),
     branch: z.string().regex(/^[a-zA-Z0-9._/-]+$/)
   })
   ```

4. **Check permissions in plugin API methods**
   ```typescript
   if (!hasPermission(pluginId, 'git:write')) {
     throw new Error('Permission denied: git:write required')
   }
   ```

### Security Testing

Run the validation test suite:

```bash
npm test -- tests/validation.spec.ts
```

Tests cover:
- NPM package name validation
- Git URL validation
- Safe execution patterns
- Error serialization

## Reporting Security Issues

If you discover a security vulnerability, please report it privately to the maintainers rather than opening a public issue.
