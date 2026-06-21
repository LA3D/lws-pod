import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/**/*.test.mjs'],
    testTimeout: 30000,
    hookTimeout: 30000,
    fileParallelism: false, // shared pod state — run test files serially
  },
})
