import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  // api/ is a separate Vercel serverless-function codebase (its own
  // tsconfig, checked via `tsc --noEmit -p api/tsconfig.json`) — it has no
  // Vite/React Fast Refresh concept, so the frontend's React-specific rules
  // don't apply there.
  globalIgnores(['dist', 'api']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
    },
  },
])
