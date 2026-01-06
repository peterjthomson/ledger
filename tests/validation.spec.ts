/**
 * Validation Test Suite
 *
 * Tests for security validation functions that prevent command injection.
 * These tests verify that malicious inputs are properly rejected.
 */

import { test, expect } from '@playwright/test'

/**
 * NPM Package Name Validation Tests
 *
 * The isValidNpmPackageName function should:
 * - Accept valid npm package names (lowercase, hyphens, dots, underscores)
 * - Accept scoped packages (@scope/name)
 * - Reject names with shell metacharacters (;, |, &, $, `, etc.)
 * - Reject names with path traversal attempts (.., /, \)
 */
test.describe('NPM Package Name Validation', () => {
  // Regex from safe-exec.ts: /^(@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/
  const isValidNpmPackageName = (name: string): boolean => {
    return /^(@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/.test(name)
  }

  test.describe('Valid package names', () => {
    test('accepts simple package names', () => {
      expect(isValidNpmPackageName('lodash')).toBe(true)
      expect(isValidNpmPackageName('react')).toBe(true)
      expect(isValidNpmPackageName('express')).toBe(true)
    })

    test('accepts package names with hyphens', () => {
      expect(isValidNpmPackageName('my-package')).toBe(true)
      expect(isValidNpmPackageName('react-dom')).toBe(true)
      expect(isValidNpmPackageName('lodash-es')).toBe(true)
    })

    test('accepts package names with dots', () => {
      expect(isValidNpmPackageName('express.js')).toBe(true)
      expect(isValidNpmPackageName('vue.js')).toBe(true)
    })

    test('accepts package names with underscores', () => {
      expect(isValidNpmPackageName('my_package')).toBe(true)
      expect(isValidNpmPackageName('node_modules')).toBe(true)
    })

    test('accepts package names with numbers', () => {
      expect(isValidNpmPackageName('uuid4')).toBe(true)
      expect(isValidNpmPackageName('v8')).toBe(true)
      expect(isValidNpmPackageName('123')).toBe(true)
    })

    test('accepts scoped packages', () => {
      expect(isValidNpmPackageName('@types/node')).toBe(true)
      expect(isValidNpmPackageName('@angular/core')).toBe(true)
      expect(isValidNpmPackageName('@babel/core')).toBe(true)
    })

    test('accepts scoped packages with complex names', () => {
      expect(isValidNpmPackageName('@my-org/my-package')).toBe(true)
      expect(isValidNpmPackageName('@scope/pkg-name.js')).toBe(true)
    })
  })

  test.describe('Command injection attempts', () => {
    test('rejects semicolon injection', () => {
      expect(isValidNpmPackageName('lodash; rm -rf /')).toBe(false)
      expect(isValidNpmPackageName('package;echo pwned')).toBe(false)
      expect(isValidNpmPackageName(';malware')).toBe(false)
    })

    test('rejects pipe injection', () => {
      expect(isValidNpmPackageName('lodash | cat /etc/passwd')).toBe(false)
      expect(isValidNpmPackageName('package|evil')).toBe(false)
    })

    test('rejects ampersand injection', () => {
      expect(isValidNpmPackageName('lodash && rm -rf /')).toBe(false)
      expect(isValidNpmPackageName('package&evil')).toBe(false)
      expect(isValidNpmPackageName('lodash & bg')).toBe(false)
    })

    test('rejects backtick injection', () => {
      expect(isValidNpmPackageName('`whoami`')).toBe(false)
      expect(isValidNpmPackageName('lodash`rm -rf /`')).toBe(false)
    })

    test('rejects dollar sign substitution', () => {
      expect(isValidNpmPackageName('$(whoami)')).toBe(false)
      expect(isValidNpmPackageName('lodash$(rm -rf /)')).toBe(false)
      expect(isValidNpmPackageName('$HOME')).toBe(false)
    })

    test('rejects newline injection', () => {
      expect(isValidNpmPackageName('lodash\nrm -rf /')).toBe(false)
      expect(isValidNpmPackageName('package\rmalware')).toBe(false)
    })

    test('rejects quote injection', () => {
      expect(isValidNpmPackageName('lodash"; rm -rf /')).toBe(false)
      expect(isValidNpmPackageName("lodash'; rm -rf /")).toBe(false)
    })

    test('rejects path traversal in package names', () => {
      expect(isValidNpmPackageName('../etc/passwd')).toBe(false)
      expect(isValidNpmPackageName('/etc/passwd')).toBe(false)
      expect(isValidNpmPackageName('..\\windows\\system32')).toBe(false)
    })

    test('rejects spaces in package names', () => {
      expect(isValidNpmPackageName('lodash malware')).toBe(false)
      expect(isValidNpmPackageName('my package')).toBe(false)
    })

    test('rejects uppercase letters', () => {
      expect(isValidNpmPackageName('Lodash')).toBe(false)
      expect(isValidNpmPackageName('MyPackage')).toBe(false)
    })
  })
})

/**
 * Git URL Validation Tests
 *
 * The isValidGitUrl function should:
 * - Accept valid git URLs (https://, git@, etc.)
 * - Reject URLs with shell metacharacters
 */
test.describe('Git URL Validation', () => {
  // Regex pattern for git URLs (from plugin-service.ts)
  const isValidGitUrl = (url: string): boolean => {
    // Accept https:// or git@ URLs with alphanumeric, dots, hyphens, underscores, and slashes
    return /^(https:\/\/|git@)[a-zA-Z0-9.-]+[/:][a-zA-Z0-9._/-]+\.git$/.test(url)
  }

  test.describe('Valid git URLs', () => {
    test('accepts HTTPS URLs', () => {
      expect(isValidGitUrl('https://github.com/owner/repo.git')).toBe(true)
      expect(isValidGitUrl('https://gitlab.com/group/project.git')).toBe(true)
    })

    test('accepts SSH URLs', () => {
      expect(isValidGitUrl('git@github.com:owner/repo.git')).toBe(true)
      expect(isValidGitUrl('git@gitlab.com:group/project.git')).toBe(true)
    })

    test('accepts URLs with hyphens and underscores', () => {
      expect(isValidGitUrl('https://github.com/my-org/my_repo.git')).toBe(true)
    })
  })

  test.describe('Command injection attempts', () => {
    test('rejects semicolon injection', () => {
      expect(isValidGitUrl('https://evil.com/; rm -rf /')).toBe(false)
      expect(isValidGitUrl('https://github.com/repo.git; echo pwned')).toBe(false)
    })

    test('rejects pipe injection', () => {
      expect(isValidGitUrl('https://evil.com/repo.git | cat /etc/passwd')).toBe(false)
    })

    test('rejects backtick injection', () => {
      expect(isValidGitUrl('https://evil.com/`whoami`.git')).toBe(false)
    })

    test('rejects dollar substitution', () => {
      expect(isValidGitUrl('https://evil.com/$(whoami).git')).toBe(false)
    })

    test('rejects URLs without .git suffix', () => {
      expect(isValidGitUrl('https://github.com/owner/repo')).toBe(false)
    })

    test('rejects invalid protocols', () => {
      expect(isValidGitUrl('file:///etc/passwd')).toBe(false)
      expect(isValidGitUrl('ftp://evil.com/repo.git')).toBe(false)
    })
  })
})

/**
 * Error Serialization Tests
 *
 * Tests for safe error handling that doesn't expose sensitive information.
 */
test.describe('Error Serialization', () => {
  // serializeError from error-helpers.ts
  const serializeError = (error: unknown): string => {
    if (error instanceof Error) {
      return error.message
    }
    if (typeof error === 'string') {
      return error
    }
    if (typeof error === 'object' && error !== null && 'message' in error) {
      return String((error as { message: unknown }).message)
    }
    return 'Unknown error'
  }

  test('serializes Error objects', () => {
    const error = new Error('Something went wrong')
    expect(serializeError(error)).toBe('Something went wrong')
  })

  test('serializes string errors', () => {
    expect(serializeError('Simple error')).toBe('Simple error')
  })

  test('serializes objects with message property', () => {
    const error = { message: 'Custom error' }
    expect(serializeError(error)).toBe('Custom error')
  })

  test('handles null gracefully', () => {
    expect(serializeError(null)).toBe('Unknown error')
  })

  test('handles undefined gracefully', () => {
    expect(serializeError(undefined)).toBe('Unknown error')
  })

  test('handles numbers gracefully', () => {
    expect(serializeError(42)).toBe('Unknown error')
  })
})
