import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['packages/**/*.test.ts', 'apps/desktop/electron/**/*.test.ts'],
    globals: true,
    coverage: {
      include: ['packages/*/src/**/*.ts', 'apps/desktop/electron/**/*.ts'],
      exclude: ['**/*.test.ts']
    }
  }
})
