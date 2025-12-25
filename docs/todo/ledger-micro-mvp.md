# Ledger Micro MVP

Build a local Electron app that displays branches and worktrees for a git repository.

## Goal

A working desktop app where I can:
1. Select a git repository folder
2. See a list of all branches (local + remote)
3. See a list of all worktrees
4. Click to refresh

That's it. No editing, no committing, just viewing.

---

## Step 1: Scaffold the Electron + React app

```bash
git clone https://github.com/guasam/electron-react-app.git ledger
cd ledger
npm install
```

Verify it runs:
```bash
npm run dev
```

You should see a basic Electron window with React content.

---

## Step 2: Install simple-git

```bash
npm install simple-git
```

This gives us a clean API for git operations in Node.js.

---

## Step 3: Create the git service in the main process

Create `src/main/git-service.ts`:

```typescript
import { simpleGit, SimpleGit } from 'simple-git';

let git: SimpleGit | null = null;
let repoPath: string | null = null;

export function setRepoPath(path: string) {
  repoPath = path;
  git = simpleGit(path);
}

export function getRepoPath(): string | null {
  return repoPath;
}

export async function getBranches() {
  if (!git) throw new Error('No repository selected');
  
  const result = await git.branch(['-a', '-v']);
  return {
    current: result.current,
    branches: Object.entries(result.branches).map(([name, data]) => ({
      name,
      current: data.current,
      commit: data.commit,
      label: data.label,
      isRemote: name.startsWith('remotes/'),
    })),
  };
}

export async function getWorktrees() {
  if (!git) throw new Error('No repository selected');
  
  // git worktree list --porcelain gives machine-readable output
  const result = await git.raw(['worktree', 'list', '--porcelain']);
  
  const worktrees: Array<{
    path: string;
    head: string;
    branch: string | null;
    bare: boolean;
  }> = [];
  
  let current: any = {};
  
  for (const line of result.split('\n')) {
    if (line.startsWith('worktree ')) {
      if (current.path) worktrees.push(current);
      current = { path: line.replace('worktree ', ''), bare: false };
    } else if (line.startsWith('HEAD ')) {
      current.head = line.replace('HEAD ', '');
    } else if (line.startsWith('branch ')) {
      current.branch = line.replace('branch ', '').replace('refs/heads/', '');
    } else if (line === 'bare') {
      current.bare = true;
    } else if (line === 'detached') {
      current.branch = null;
    }
  }
  
  if (current.path) worktrees.push(current);
  
  return worktrees;
}
```

---

## Step 4: Wire up IPC handlers in main process

Update `src/main/index.ts` to add IPC handlers. Add these imports and handlers:

```typescript
import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import { setRepoPath, getRepoPath, getBranches, getWorktrees } from './git-service';

// Add these IPC handlers after the app is ready, before creating the window:

ipcMain.handle('select-repo', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory'],
    title: 'Select Git Repository',
  });
  
  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }
  
  const path = result.filePaths[0];
  setRepoPath(path);
  return path;
});

ipcMain.handle('get-repo-path', () => {
  return getRepoPath();
});

ipcMain.handle('get-branches', async () => {
  try {
    return await getBranches();
  } catch (error) {
    return { error: (error as Error).message };
  }
});

ipcMain.handle('get-worktrees', async () => {
  try {
    return await getWorktrees();
  } catch (error) {
    return { error: (error as Error).message };
  }
});
```

---

## Step 5: Expose IPC to renderer via preload

Update `src/preload/index.ts`:

```typescript
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  selectRepo: () => ipcRenderer.invoke('select-repo'),
  getRepoPath: () => ipcRenderer.invoke('get-repo-path'),
  getBranches: () => ipcRenderer.invoke('get-branches'),
  getWorktrees: () => ipcRenderer.invoke('get-worktrees'),
});
```

---

## Step 6: Add TypeScript types for the API

Create `src/renderer/src/types/electron.d.ts`:

```typescript
export interface Branch {
  name: string;
  current: boolean;
  commit: string;
  label: string;
  isRemote: boolean;
}

export interface BranchesResult {
  current: string;
  branches: Branch[];
  error?: string;
}

export interface Worktree {
  path: string;
  head: string;
  branch: string | null;
  bare: boolean;
}

export interface ElectronAPI {
  selectRepo: () => Promise<string | null>;
  getRepoPath: () => Promise<string | null>;
  getBranches: () => Promise<BranchesResult>;
  getWorktrees: () => Promise<Worktree[] | { error: string }>;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
```

---

## Step 7: Build the React UI

Replace `src/renderer/src/App.tsx`:

```tsx
import { useState, useEffect } from 'react';
import type { Branch, Worktree } from './types/electron';

function App() {
  const [repoPath, setRepoPath] = useState<string | null>(null);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [currentBranch, setCurrentBranch] = useState<string>('');
  const [worktrees, setWorktrees] = useState<Worktree[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const selectRepo = async () => {
    const path = await window.electronAPI.selectRepo();
    if (path) {
      setRepoPath(path);
      await refresh();
    }
  };

  const refresh = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const [branchResult, worktreeResult] = await Promise.all([
        window.electronAPI.getBranches(),
        window.electronAPI.getWorktrees(),
      ]);

      if ('error' in branchResult) {
        setError(branchResult.error);
      } else {
        setBranches(branchResult.branches);
        setCurrentBranch(branchResult.current);
      }

      if ('error' in worktreeResult) {
        setError(worktreeResult.error);
      } else {
        setWorktrees(worktreeResult);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Check if we already have a repo selected
    window.electronAPI.getRepoPath().then((path) => {
      if (path) {
        setRepoPath(path);
        refresh();
      }
    });
  }, []);

  const localBranches = branches.filter((b) => !b.isRemote);
  const remoteBranches = branches.filter((b) => b.isRemote);

  return (
    <div style={{ padding: 20, fontFamily: 'system-ui, sans-serif' }}>
      <h1 style={{ marginTop: 0 }}>Ledger</h1>

      {/* Repo Selection */}
      <div style={{ marginBottom: 20 }}>
        <button onClick={selectRepo} style={{ marginRight: 10 }}>
          Select Repository
        </button>
        {repoPath && (
          <button onClick={refresh} disabled={loading}>
            {loading ? 'Loading...' : 'Refresh'}
          </button>
        )}
      </div>

      {repoPath && (
        <div style={{ marginBottom: 20, color: '#666' }}>
          <strong>Repository:</strong> {repoPath}
        </div>
      )}

      {error && (
        <div style={{ color: 'red', marginBottom: 20 }}>
          <strong>Error:</strong> {error}
        </div>
      )}

      {repoPath && !error && (
        <div style={{ display: 'flex', gap: 40 }}>
          {/* Worktrees */}
          <div style={{ flex: 1 }}>
            <h2>Worktrees ({worktrees.length})</h2>
            {worktrees.length === 0 ? (
              <p style={{ color: '#666' }}>No worktrees found</p>
            ) : (
              <ul style={{ listStyle: 'none', padding: 0 }}>
                {worktrees.map((wt) => (
                  <li
                    key={wt.path}
                    style={{
                      padding: '8px 12px',
                      marginBottom: 8,
                      background: '#f5f5f5',
                      borderRadius: 4,
                      borderLeft: wt.branch === currentBranch ? '3px solid #007aff' : '3px solid transparent',
                    }}
                  >
                    <div style={{ fontWeight: 500 }}>
                      {wt.branch || '(detached)'}
                    </div>
                    <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>
                      {wt.path}
                    </div>
                    <div style={{ fontSize: 11, color: '#999', marginTop: 2 }}>
                      {wt.head.slice(0, 7)}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Local Branches */}
          <div style={{ flex: 1 }}>
            <h2>Local Branches ({localBranches.length})</h2>
            <ul style={{ listStyle: 'none', padding: 0 }}>
              {localBranches.map((branch) => (
                <li
                  key={branch.name}
                  style={{
                    padding: '8px 12px',
                    marginBottom: 4,
                    background: branch.current ? '#e8f4ff' : '#f5f5f5',
                    borderRadius: 4,
                    borderLeft: branch.current ? '3px solid #007aff' : '3px solid transparent',
                  }}
                >
                  <div style={{ fontWeight: branch.current ? 600 : 400 }}>
                    {branch.current && '→ '}
                    {branch.name}
                  </div>
                  <div style={{ fontSize: 11, color: '#999' }}>
                    {branch.commit.slice(0, 7)}
                  </div>
                </li>
              ))}
            </ul>
          </div>

          {/* Remote Branches */}
          <div style={{ flex: 1 }}>
            <h2>Remote Branches ({remoteBranches.length})</h2>
            <ul style={{ listStyle: 'none', padding: 0, maxHeight: 400, overflow: 'auto' }}>
              {remoteBranches.map((branch) => (
                <li
                  key={branch.name}
                  style={{
                    padding: '6px 12px',
                    marginBottom: 2,
                    background: '#fafafa',
                    borderRadius: 4,
                    fontSize: 13,
                  }}
                >
                  <div style={{ color: '#666' }}>
                    {branch.name.replace('remotes/', '')}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
```

---

## Step 8: Run it

```bash
npm run dev
```

1. Click "Select Repository"
2. Navigate to any git repo on your machine
3. See branches and worktrees listed
4. Click "Refresh" to update

---

## What You Should See

- A window with "Ledger" title
- "Select Repository" button
- After selecting a repo:
  - Three columns: Worktrees, Local Branches, Remote Branches
  - Current branch highlighted with blue left border
  - Short commit hashes shown
  - Worktree paths displayed

---

## File Structure After Setup

```
ledger/
├── src/
│   ├── main/
│   │   ├── index.ts          # Updated with IPC handlers
│   │   └── git-service.ts    # New file
│   ├── preload/
│   │   └── index.ts          # Updated with API exposure
│   └── renderer/
│       └── src/
│           ├── App.tsx       # New React UI
│           └── types/
│               └── electron.d.ts  # New type definitions
├── package.json
└── ...
```

---

## Troubleshooting

**"Not a git repository" error:**
- Make sure you selected a folder that contains a `.git` directory

**IPC not working:**
- Check the preload script is being loaded (look in electron config)
- Make sure contextIsolation is enabled in webPreferences

**TypeScript errors:**
- Run `npm run typecheck` to see specific issues
- The boilerplate may need the types file path added to tsconfig

---

## Next Steps After MVP

Once this is working, the next micro-iteration would be:
1. Add "Create Worktree" button
2. Add "Delete Worktree" button  
3. Persist last-used repo path
4. Add keyboard shortcuts (Cmd+R to refresh)
