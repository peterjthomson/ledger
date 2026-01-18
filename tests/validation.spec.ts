/**
 * Validation Test Suite
 *
 * Tests for security validation functions that prevent command injection.
 * These tests verify that malicious inputs are properly rejected.
 *
 * Tests the actual exported functions from lib/utils/safe-exec.ts and
 * lib/utils/error-helpers.ts - not duplicated implementations.
 */

import { test, expect } from '@playwright/test'
import { isValidNpmPackageName, isValidGitUrl } from '../lib/utils/safe-exec'
import { serializeError } from '../lib/utils/error-helpers'

/**
 * NPM Package Name Validation
 */
test.describe('NPM Package Name Validation', () => {
  test.describe('accepts valid names', () => {
    test('simple names', () => {
      expect(isValidNpmPackageName('lodash')).toBe(true)
      expect(isValidNpmPackageName('react')).toBe(true)
      expect(isValidNpmPackageName('express')).toBe(true)
    })

    test('names with hyphens, dots, underscores', () => {
      expect(isValidNpmPackageName('my-package')).toBe(true)
      expect(isValidNpmPackageName('express.js')).toBe(true)
      expect(isValidNpmPackageName('my_package')).toBe(true)
    })

    test('scoped packages', () => {
      expect(isValidNpmPackageName('@types/node')).toBe(true)
      expect(isValidNpmPackageName('@angular/core')).toBe(true)
      expect(isValidNpmPackageName('@my-org/my-package')).toBe(true)
    })
  })

  test.describe('rejects injection attempts', () => {
    test('shell metacharacters', () => {
      expect(isValidNpmPackageName('lodash; rm -rf /')).toBe(false)
      expect(isValidNpmPackageName('lodash | cat /etc/passwd')).toBe(false)
      expect(isValidNpmPackageName('lodash && rm -rf /')).toBe(false)
      expect(isValidNpmPackageName('`whoami`')).toBe(false)
      expect(isValidNpmPackageName('$(whoami)')).toBe(false)
    })

    test('path traversal', () => {
      expect(isValidNpmPackageName('../etc/passwd')).toBe(false)
      expect(isValidNpmPackageName('/etc/passwd')).toBe(false)
    })

    test('invalid characters', () => {
      expect(isValidNpmPackageName('Lodash')).toBe(false) // uppercase
      expect(isValidNpmPackageName('lodash malware')).toBe(false) // space
    })
  })
})

/**
 * Git URL Validation
 */
test.describe('Git URL Validation', () => {
  test.describe('accepts valid URLs', () => {
    test('HTTPS URLs with .git suffix', () => {
      expect(isValidGitUrl('https://github.com/owner/repo.git')).toBe(true)
      expect(isValidGitUrl('https://gitlab.com/group/project.git')).toBe(true)
    })

    test('SSH URLs', () => {
      expect(isValidGitUrl('git@github.com:owner/repo.git')).toBe(true)
      expect(isValidGitUrl('git@gitlab.com:group/project.git')).toBe(true)
    })

    test('GitHub URLs without .git suffix', () => {
      expect(isValidGitUrl('https://github.com/owner/repo')).toBe(true)
      expect(isValidGitUrl('https://github.com/my-org/my-repo')).toBe(true)
    })
  })

  test.describe('rejects injection attempts', () => {
    test('shell metacharacters', () => {
      expect(isValidGitUrl('https://evil.com/; rm -rf /')).toBe(false)
      expect(isValidGitUrl('https://evil.com/repo.git | cat /etc/passwd')).toBe(false)
      expect(isValidGitUrl('https://evil.com/`whoami`.git')).toBe(false)
    })

    test('invalid protocols', () => {
      expect(isValidGitUrl('file:///etc/passwd')).toBe(false)
      expect(isValidGitUrl('ftp://evil.com/repo.git')).toBe(false)
    })
  })
})

/**
 * Error Serialization
 */
test.describe('Error Serialization', () => {
  test('extracts message from Error objects', () => {
    expect(serializeError(new Error('Something went wrong'))).toBe('Something went wrong')
  })

  test('passes through strings', () => {
    expect(serializeError('Simple error')).toBe('Simple error')
  })

  test('extracts message property from objects', () => {
    expect(serializeError({ message: 'Custom error' })).toBe('Custom error')
  })

  test('handles null/undefined gracefully', () => {
    expect(serializeError(null)).toBe('Unknown error')
    expect(serializeError(undefined)).toBe('Unknown error')
  })
})
