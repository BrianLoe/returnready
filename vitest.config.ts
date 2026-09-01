import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    // `e2e/**` holds Playwright specs (`test:browser`, its own runner and
    // config) -- vitest's default include glob otherwise also matches
    // `*.spec.ts` there and tries to run them as unit tests, which fails
    // immediately because they call Playwright's own `test.describe()`.
    exclude: ['**/node_modules/**', '**/dist/**', 'e2e/**'],
  },
});
