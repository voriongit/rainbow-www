// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Vorion LLC

// eslint-config-next 16 ships a native ESLint 9 flat config (an array of
// Linter.Config). Import it directly — the older FlatCompat bridge
// (`compat.extends('next/...')`) crashes under ESLint 9 with a
// "Converting circular structure to JSON" error from the eslintrc compat layer.
import next from 'eslint-config-next';

const eslintConfig = [
  ...next,
  {
    ignores: ['node_modules/**', '.next/**', 'out/**'],
  },
];

export default eslintConfig;
