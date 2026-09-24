import { defineConfig } from '@playwright/test'
import { accessSync, constants, statSync } from 'node:fs'
import { isAbsolute } from 'node:path'
import config from './playwright.config'

const executable = process.env.LEDGER_PACKAGED_EXECUTABLE
if (!executable || !isAbsolute(executable)) {
  throw new Error('Set LEDGER_PACKAGED_EXECUTABLE to the absolute path of the packaged app executable.')
}
try {
  accessSync(executable, constants.X_OK)
  if (!statSync(executable).isFile()) throw new Error('Expected an executable file')
} catch {
  throw new Error(`Packaged app executable is missing or cannot be executed: ${executable}`)
}

export default defineConfig({
  ...config,
  testIgnore: [],
  testMatch: '**/package-smoke.spec.ts',
})
