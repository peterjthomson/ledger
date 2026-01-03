import eslint from '@eslint/js'
import tseslint from 'typescript-eslint'
import reactPlugin from 'eslint-plugin-react'
import reactHooksPlugin from 'eslint-plugin-react-hooks'

export default [
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      'build/**',
      'out/**',
      '.vscode/**',
      '.git/**',
      '.gitignore',
      '.eslintignore',
      '.eslintrc',
      '.prettierrc',
      'test-results/**',
      'scripts/**/*.js',
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{js,jsx,ts,tsx}'],
    plugins: {
      react: reactPlugin,
      'react-hooks': reactHooksPlugin,
    },
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parser: tseslint.parser,
      parserOptions: {
        ecmaFeatures: { jsx: true },
        projectService: true,
      },
      globals: {
        // Browser globals that should be readonly
        window: 'readonly',
        document: 'readonly',
        location: 'readonly',
        history: 'readonly',
        navigator: 'readonly',

        // Browser globals that can be modified
        console: 'writable',
        localStorage: 'writable',
        sessionStorage: 'writable',

        // Timer functions that can be modified
        setTimeout: 'writable',
        clearTimeout: 'writable',
        setInterval: 'writable',
        clearInterval: 'writable',

        // Node.js globals
        process: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',

        // React globals
        React: 'readonly',
      },
    },
    settings: {
      react: {
        version: 'detect',
      },
    },
    rules: {
      // React specific rules
      'react/react-in-jsx-scope': 'off',
      'react-hooks/rules-of-hooks': 'error',
      // Hooks exhaustive deps warnings are intentionally suppressed to avoid
      // churny dependencies in large effect/callback graphs.
      'react-hooks/exhaustive-deps': 'off',

      // TypeScript specific rules
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',

      // General code quality
      'no-console': 'off',
      'prefer-const': 'warn',
      'no-var': 'error',
      'eqeqeq': ['error', 'always', { null: 'ignore' }],
      'no-duplicate-imports': 'error',

      // Global modification rules
      'no-global-assign': [
        'error',
        {
          exceptions: ['console', 'localStorage', 'sessionStorage'],
        },
      ],
    },
  },
  // Specific configuration for main process files
  {
    files: ['lib/main/**/*.ts'],
    languageOptions: {
      globals: {
        process: 'readonly',
        console: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
      },
    },
  },
  // Specific configuration for renderer files
  {
    files: ['app/**/*.{ts,tsx}'],
    languageOptions: {
      globals: {
        process: 'readonly',
        console: 'readonly',
        window: 'readonly',
      },
    },
  },
  // Relax rules for plugin/example code paths (not part of shipped UI)
  {
    files: [
      'app/components/plugins/**/*.{ts,tsx}',
      'app/components/plugins/example-components/**/*.{ts,tsx}',
      'lib/plugins/**/*.{ts,tsx}',
    ],
    rules: {
      '@typescript-eslint/no-unused-vars': 'off',
    },
  },
  // Specific configuration for test files
  {
    files: ['tests/**/*.ts', 'playwright.config.ts'],
    languageOptions: {
      globals: {
        process: 'readonly',
        console: 'readonly',
      },
    },
    rules: {
      // Relax some rules for tests
      '@typescript-eslint/no-unused-vars': 'off',
      'no-console': 'off',
    },
  },
]
