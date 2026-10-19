import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

// 变异测试专用：验收测试（tests/）直接使用 core 的源码，Stryker 改动源码后测试才能看到。
// 日常测试仍使用 vitest.config.ts，经由构建产物导入 @quillarium/core。
export default defineConfig({
  resolve: {
    alias: {
      '@quillarium/core': fileURLToPath(new URL('./packages/core/src/index.ts', import.meta.url))
    }
  },
  test: {
    include: ['tests/**/*.test.ts'],
    globals: true,
    testTimeout: 120_000
  }
})
