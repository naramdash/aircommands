import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: [
      'app/**/__tests__/*.{test,spec}.ts',
      'server/**/__tests__/*.{test,spec}.ts',
      'test/unit/*.{test,spec}.ts',
      'test/e2e/*.{test,spec}.ts',
    ],
    environment: 'node',
  },
})
