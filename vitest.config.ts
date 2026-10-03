import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

/**
 * Tests run against source, not the Electron bundles, so the main-process
 * services and the renderer logic share one plain Node environment.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@shared': resolve(__dirname, 'src/shared'),
      '@': resolve(__dirname, 'src/renderer/src')
    }
  },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node'
  }
})
