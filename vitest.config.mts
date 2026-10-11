// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Vorion LLC

import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
  resolve: {
    alias: {
      // `server-only` throws outside a React Server Components build by design;
      // tests import server modules directly.
      'server-only': fileURLToPath(new URL('./tests/stubs/server-only.ts', import.meta.url)),
    },
  },
});
