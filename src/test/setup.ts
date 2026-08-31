import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// vitest.config.ts does not set `test.globals: true`, so Testing Library's
// auto-cleanup (which detects a global `afterEach`) never registers itself.
// Without this, DOM from one test's `render()` call leaks into the next.
afterEach(() => {
  cleanup();
});
