import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.spec.ts'],
    // The lint fixture is a Vue file that is meant to fail ESLint, not a test.
    exclude: ['node_modules/**', '.nuxt/**', '.output/**', 'tests/fixtures/**'],
  },
})
