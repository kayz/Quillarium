import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: [
      'packages/**/*.test.ts',
      'scripts/**/*.test.mjs',
      'apps/desktop/electron/**/*.test.ts',
      'apps/desktop/src/**/*.test.ts',
      'apps/desktop/src/**/*.test.tsx'
    ],
    globals: true,
    testTimeout: 15_000,
    coverage: {
      include: ['packages/*/src/**/*.ts', 'apps/desktop/electron/**/*.ts'],
      exclude: ['**/*.test.ts']
    }
  }
})
