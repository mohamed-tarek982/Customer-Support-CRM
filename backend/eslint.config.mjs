// @ts-check
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';

export default tseslint.config(
  {
    ignores: ['dist/**', 'node_modules/**', 'coverage/**', 'prisma/migrations/**'],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  eslintPluginPrettierRecommended,
  {
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.jest,
      },
      sourceType: 'commonjs',
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-floating-promises': 'warn',
      '@typescript-eslint/no-unsafe-argument': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      // DEFERRED-stack guard: these packages are explicitly out of scope for
      // Phase 1 (see the root README "Deferred decisions" section).
      'no-restricted-imports': [
        'error',
        {
          paths: [
            { name: 'bullmq', message: 'DEFERRED: no job queue in Phase 1. Use @nestjs/schedule.' },
            { name: 'ioredis', message: 'DEFERRED: no Redis in Phase 1.' },
            {
              name: '@nestjs/websockets',
              message: 'DEFERRED: no realtime gateway in Phase 1. Clients poll every 20-30s.',
            },
            { name: 'socket.io', message: 'DEFERRED: no realtime gateway in Phase 1.' },
            {
              name: 'meilisearch',
              message: 'DEFERRED: start with PostgreSQL full-text search.',
            },
            { name: 'moment', message: 'Use date-fns instead of Moment.js.' },
          ],
        },
      ],
    },
  },
  // Jest and tooling configs are plain CommonJS outside the TypeScript project,
  // so type-aware rules cannot run against them.
  {
    files: ['**/*.js', '**/*.cjs', '**/*.mjs'],
    ...tseslint.configs.disableTypeChecked,
  },
  // Tests assert on supertest response bodies, which the library types as `any`.
  // Poking at them is the whole point, so the unsafe-* family is relaxed here
  // and nowhere else.
  {
    files: ['**/*.spec.ts', '**/*.e2e-spec.ts'],
    rules: {
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/unbound-method': 'off',
    },
  },
);
