// @ts-check
import eslint from '@eslint/js'
import tseslint from 'typescript-eslint'
import pluginVue from 'eslint-plugin-vue'
import vueParser from 'vue-eslint-parser'
import globals from 'globals'

/**
 * Physical inline-direction utilities. A single `pl-4` in a shared component
 * silently breaks the Arabic layout: it stays pinned to the left while
 * everything around it mirrors, and nothing errors — you only find out when an
 * Arabic-speaking user reports that a page "looks wrong".
 *
 * Use the logical equivalents, which follow the reading direction:
 *   pl- -> ps-      ml- -> ms-      text-left  -> text-start
 *   pr- -> pe-      mr- -> me-      text-right -> text-end
 */
const PHYSICAL_DIRECTION = String.raw`(^|\s)(pl-|pr-|ml-|mr-|text-left|text-right)`

const PHYSICAL_MESSAGE =
  'Use Tailwind logical properties (ps-/pe-/ms-/me-/text-start/text-end) instead of physical ones. ' +
  'Physical properties silently break Arabic RTL layouts.'

/**
 * Vuetify's own utility classes. Tailwind owns spacing and layout in this
 * codebase, so these must not appear. `text-center` is deliberately absent:
 * the class is byte-identical in both systems and direction-neutral, so banning
 * it would only block valid Tailwind. See the root README.
 */
const VUETIFY_UTILITY = String.raw`(^|\s)(pa-\d|ma-\d|d-flex|d-inline-flex|d-block|d-inline|d-none)`

const VUETIFY_MESSAGE =
  'Do not use Vuetify utility classes. Tailwind owns layout and spacing: use p-*/m-* and flex/block instead of pa-*/ma-*/d-*.'

/** Applied to script blocks and plain .ts files. */
const scriptRestrictions = [
  { selector: `Literal[value=/${PHYSICAL_DIRECTION}/]`, message: PHYSICAL_MESSAGE },
  { selector: `TemplateElement[value.raw=/${PHYSICAL_DIRECTION}/]`, message: PHYSICAL_MESSAGE },
  { selector: `Literal[value=/${VUETIFY_UTILITY}/]`, message: VUETIFY_MESSAGE },
  { selector: `TemplateElement[value.raw=/${VUETIFY_UTILITY}/]`, message: VUETIFY_MESSAGE },
]

/** Applied inside <template>, where class attributes actually live. */
const templateRestrictions = [
  { selector: `VLiteral[value=/${PHYSICAL_DIRECTION}/]`, message: PHYSICAL_MESSAGE },
  { selector: `Literal[value=/${PHYSICAL_DIRECTION}/]`, message: PHYSICAL_MESSAGE },
  { selector: `TemplateElement[value.raw=/${PHYSICAL_DIRECTION}/]`, message: PHYSICAL_MESSAGE },
  { selector: `VLiteral[value=/${VUETIFY_UTILITY}/]`, message: VUETIFY_MESSAGE },
  { selector: `Literal[value=/${VUETIFY_UTILITY}/]`, message: VUETIFY_MESSAGE },
  { selector: `TemplateElement[value.raw=/${VUETIFY_UTILITY}/]`, message: VUETIFY_MESSAGE },
]

export default tseslint.config(
  {
    ignores: [
      '.nuxt/**',
      '.output/**',
      'dist/**',
      'node_modules/**',
      'coverage/**',
      // The fixture exists to FAIL this config on demand. Linting it during a
      // normal pass would make `pnpm lint` permanently red.
      // scripts/verify-lint-rule.sh lints it explicitly instead.
      'tests/fixtures/**',
    ],
  },

  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  ...pluginVue.configs['flat/recommended'],

  {
    files: ['**/*.vue'],
    languageOptions: {
      parser: vueParser,
      parserOptions: {
        parser: tseslint.parser,
        extraFileExtensions: ['.vue'],
        sourceType: 'module',
      },
    },
  },

  {
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    rules: {
      // TypeScript and Nuxt's generated types cover undefined identifiers, and
      // no-undef cannot see Nuxt's auto-imports (ref, computed, useI18n, ...).
      'no-undef': 'off',
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      // Single-word page and layout filenames are the Nuxt routing convention.
      'vue/multi-word-component-names': 'off',

      'no-restricted-syntax': ['error', ...scriptRestrictions],
      'vue/no-restricted-syntax': ['error', ...templateRestrictions],

      // DEFERRED-stack guard, mirroring the backend config. See the root README,
      // "Deferred decisions".
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'moment',
              message: 'Use date-fns. Moment.js is deprecated, mutable, and does not tree-shake.',
            },
            {
              name: 'socket.io-client',
              message: 'DEFERRED: no realtime gateway in Phase 1. Poll every 20-30s instead.',
            },
            {
              name: 'meilisearch',
              message: 'DEFERRED: start with PostgreSQL full-text search.',
            },
          ],
        },
      ],
    },
  },

  {
    files: ['**/*.spec.ts', '**/*.test.ts'],
    rules: {
      // Test files assert on the banned class names, so the ban cannot apply here.
      'no-restricted-syntax': 'off',
    },
  },
)
