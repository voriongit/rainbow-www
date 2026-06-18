// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Vorion LLC

import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      // iOS/Android notch + home-indicator insets. Requires viewport-fit:cover
      // (set in app/layout.tsx). Usage: pb-safe-b, pt-safe-t, etc.
      spacing: {
        'safe-t': 'env(safe-area-inset-top)',
        'safe-b': 'env(safe-area-inset-bottom)',
        'safe-l': 'env(safe-area-inset-left)',
        'safe-r': 'env(safe-area-inset-right)',
      },
    },
  },
  plugins: [],
};

export default config;
