# Test Runner - Parallel Test Execution for Branches/PRs

Run tests for any branch or PR without switching your working directory.

## The Insight

Same pattern as Preview:
```
Preview: worktree + symlinked deps → run server → open browser
Tests:   worktree + symlinked deps → run tests → show results
```

But tests are **simpler**:
- One-shot command (not long-running)
- No URL/port management
- No asset compilation needed
- Just capture stdout/stderr

## Use Cases

| Action | What Happens |
|--------|--------------|
| "Run Tests" on PR | See if tests pass before merging |
| "Run Tests" on branch | Validate work without checkout |
| Compare test results | Run on main vs feature, show diff |
| Parallel test runs | Test multiple branches simultaneously |

## Provider Pattern

```typescript
interface TestProvider {
  id: string                    // 'laravel', 'rails', 'node', 'python'
  name: string                  // 'PHPUnit', 'RSpec', 'Jest'
  
  checkAvailability(repoPath: string): Promise<{
    available: boolean
    compatible: boolean
    testCommand?: string        // Detected command
  }>
  
  runTests(worktreePath: string, options?: {
    filter?: string             // Run specific test file/pattern
    parallel?: boolean          // Run in parallel (if supported)
    coverage?: boolean          // Generate coverage report
  }): Promise<TestResult>
}

interface TestResult {
  success: boolean
  passed: number
  failed: number
  skipped: number
  duration: number              // ms
  output: string                // Full stdout/stderr
  failures?: TestFailure[]      // Parsed failures
  coverage?: CoverageReport
}

interface TestFailure {
  test: string                  // Test name
  file: string                  // File path
  line?: number                 // Line number
  message: string               // Failure message
  diff?: string                 // Expected vs actual
}
```

## Built-in Providers

### laravelTestProvider

```typescript
const laravelTestProvider: TestProvider = {
  id: 'laravel',
  name: 'PHPUnit',
  
  async checkAvailability(repoPath) {
    const hasArtisan = fs.existsSync(`${repoPath}/artisan`)
    const hasPhpunit = fs.existsSync(`${repoPath}/vendor/bin/phpunit`)
    
    return {
      available: hasArtisan && hasPhpunit,
      compatible: hasArtisan,
      testCommand: hasArtisan ? 'php artisan test' : './vendor/bin/phpunit',
    }
  },
  
  async runTests(worktreePath, options) {
    let cmd = 'php artisan test'
    
    if (options?.filter) cmd += ` --filter="${options.filter}"`
    if (options?.parallel) cmd += ' --parallel'
    if (options?.coverage) cmd += ' --coverage'
    
    const { stdout, stderr, exitCode } = await exec(cmd, { cwd: worktreePath })
    
    return parsePhpunitOutput(stdout, stderr, exitCode)
  },
}
```

### railsTestProvider

```typescript
const railsTestProvider: TestProvider = {
  id: 'rails',
  name: 'RSpec / Minitest',
  
  async checkAvailability(repoPath) {
    const hasRspec = fs.existsSync(`${repoPath}/spec`)
    const hasMinitest = fs.existsSync(`${repoPath}/test`)
    
    return {
      available: hasRspec || hasMinitest,
      compatible: true,
      testCommand: hasRspec ? 'bundle exec rspec' : 'rails test',
    }
  },
  
  async runTests(worktreePath, options) {
    const hasRspec = fs.existsSync(`${worktreePath}/spec`)
    let cmd = hasRspec ? 'bundle exec rspec' : 'rails test'
    
    if (options?.filter) cmd += ` ${options.filter}`
    if (options?.parallel && !hasRspec) cmd += ' --parallel'
    
    const { stdout, stderr, exitCode } = await exec(cmd, { cwd: worktreePath })
    
    return hasRspec 
      ? parseRspecOutput(stdout, stderr, exitCode)
      : parseMinitestOutput(stdout, stderr, exitCode)
  },
}
```

### nodeTestProvider

```typescript
const nodeTestProvider: TestProvider = {
  id: 'node',
  name: 'Jest / Vitest / Mocha',
  
  async checkAvailability(repoPath) {
    const pkg = JSON.parse(fs.readFileSync(`${repoPath}/package.json`, 'utf-8'))
    const hasTestScript = !!pkg.scripts?.test
    
    // Detect test runner
    const deps = { ...pkg.dependencies, ...pkg.devDependencies }
    const runner = deps.vitest ? 'vitest' 
                 : deps.jest ? 'jest'
                 : deps.mocha ? 'mocha'
                 : 'npm test'
    
    return {
      available: hasTestScript,
      compatible: !!pkg,
      testCommand: `npm test`,
    }
  },
  
  async runTests(worktreePath, options) {
    let cmd = 'npm test'
    
    // Pass filter to Jest/Vitest via -- separator
    if (options?.filter) cmd += ` -- --testPathPattern="${options.filter}"`
    if (options?.coverage) cmd += ' -- --coverage'
    
    const { stdout, stderr, exitCode } = await exec(cmd, { cwd: worktreePath })
    
    return parseJestOutput(stdout, stderr, exitCode)
  },
}
```

### pythonTestProvider

```typescript
const pythonTestProvider: TestProvider = {
  id: 'python',
  name: 'pytest',
  
  async checkAvailability(repoPath) {
    const hasPytest = fs.existsSync(`${repoPath}/pytest.ini`) ||
                      fs.existsSync(`${repoPath}/pyproject.toml`) ||
                      fs.existsSync(`${repoPath}/tests`)
    
    return {
      available: hasPytest,
      compatible: hasPytest,
      testCommand: 'pytest',
    }
  },
  
  async runTests(worktreePath, options) {
    let cmd = 'pytest'
    
    if (options?.filter) cmd += ` -k "${options.filter}"`
    if (options?.parallel) cmd += ' -n auto'  // pytest-xdist
    if (options?.coverage) cmd += ' --cov'
    
    const { stdout, stderr, exitCode } = await exec(cmd, { cwd: worktreePath })
    
    return parsePytestOutput(stdout, stderr, exitCode)
  },
}
```

## Worktree Setup (Same as Preview)

```typescript
async function setupTestWorktree(worktreePath: string, mainRepoPath: string) {
  // 1. Symlink dependencies (same as preview)
  await symlink(`${mainRepoPath}/vendor`, `${worktreePath}/vendor`)
  await symlink(`${mainRepoPath}/node_modules`, `${worktreePath}/node_modules`)
  
  // 2. Copy test database config (DIFFERENT from preview)
  //    Tests need isolated DB to avoid corrupting dev data
  await setupTestDatabase(worktreePath, mainRepoPath)
  
  // 3. Copy .env.testing or create one
  await setupTestEnv(worktreePath, mainRepoPath)
}

async function setupTestDatabase(worktreePath: string, mainRepoPath: string) {
  // Laravel: copy phpunit.xml, use SQLite for speed
  // Rails: copy database.yml, use test DB with worktree suffix
  // Node: usually mocked, no DB setup needed
}
```

## Database Isolation Strategy

| Framework | Strategy |
|-----------|----------|
| **Laravel** | Use SQLite in-memory for tests (fast, isolated) |
| **Rails** | Suffix test DB name: `myapp_feature_x_test` |
| **Node** | Usually mocked, or use test containers |
| **Python** | pytest fixtures, SQLite, or test containers |

```xml
<!-- Laravel: phpunit.xml override for worktree -->
<php>
    <env name="DB_CONNECTION" value="sqlite"/>
    <env name="DB_DATABASE" value=":memory:"/>
</php>
```

```yaml
# Rails: database.yml for worktree
test:
  database: myapp_<%= ENV['WORKTREE_NAME'] %>_test
```

## UI Integration

### Branch Panel
```
┌─────────────────────────────────────┐
│ feature/new-checkout                │
│ 3 commits ahead of main             │
├─────────────────────────────────────┤
│ [Checkout] [Preview] [Run Tests]    │
│                                     │
│ ┌─ Test Results ──────────────────┐ │
│ │ ✓ 42 passed  ✗ 2 failed  ⊘ 1   │ │
│ │ Duration: 4.2s                  │ │
│ │                                 │ │
│ │ Failures:                       │ │
│ │ ✗ CheckoutTest::testPayment    │ │
│ │   Expected 200, got 500        │ │
│ │   at tests/CheckoutTest.php:42 │ │
│ └─────────────────────────────────┘ │
└─────────────────────────────────────┘
```

### PR Panel
```
┌─────────────────────────────────────┐
│ PR #123: Add checkout flow          │
│ feature/checkout → main             │
├─────────────────────────────────────┤
│ [Checkout] [Preview] [Run Tests]    │
│            [Merge]                  │
│                                     │
│ Tests: ✓ Passing (42/42)            │
│ Coverage: 87% (+2%)                 │
└─────────────────────────────────────┘
```

## Comparing Test Results

Run tests on both branches, show diff:

```
┌─────────────────────────────────────────────────┐
│ Test Comparison: main vs feature/checkout       │
├─────────────────────────────────────────────────┤
│                    main    feature    diff      │
│ Passed:            45      42         -3        │
│ Failed:            0       2          +2        │
│ Duration:          3.8s    4.2s       +0.4s     │
│ Coverage:          85%     87%        +2%       │
├─────────────────────────────────────────────────┤
│ New Failures (not in main):                     │
│ ✗ CheckoutTest::testPaymentValidation           │
│ ✗ CheckoutTest::testInventoryCheck              │
│                                                 │
│ Regressions (was passing in main):              │
│ ✗ CartTest::testAddItem                         │
└─────────────────────────────────────────────────┘
```

## IPC Channels

```typescript
// Run tests for a worktree
'test:run-worktree' (providerId, worktreePath, options?) → TestResult

// Run tests for a branch (creates worktree if needed)
'test:run-branch' (providerId, branchName, mainRepoPath, options?) → TestResult

// Run tests for a PR
'test:run-pr' (providerId, prNumber, prBranchName, mainRepoPath, options?) → TestResult

// Compare tests between two refs
'test:compare' (providerId, baseRef, headRef, mainRepoPath) → TestComparison

// Get available test providers
'test:get-providers' (repoPath) → TestProvider[]

// Cancel running tests
'test:cancel' (worktreePath) → void
```

## Benefits Over CI

| CI (GitHub Actions) | Ledger Test Runner |
|---------------------|-------------------|
| Runs in cloud | Runs locally (faster feedback) |
| Full checkout | Symlinked deps (instant setup) |
| Wait for queue | Run immediately |
| All tests | Filter to specific tests |
| See logs after | See results in real-time |
| Need to push first | Test uncommitted changes |

## Implementation Priority

1. **Phase 1**: Basic test running (single provider, no comparison)
2. **Phase 2**: Multiple providers, test filtering
3. **Phase 3**: Test comparison between branches
4. **Phase 4**: Coverage reports, trend tracking
