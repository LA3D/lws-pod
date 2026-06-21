import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['**/*.test.mjs', '**/*.test.js', '**/*.spec.mjs', '**/*.spec.js'],
  },
})
