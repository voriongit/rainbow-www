// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Vorion LLC

import { FlatCompat } from '@eslint/eslintrc';

const compat = new FlatCompat({
  baseDirectory: import.meta.dirname,
});

const eslintConfig = [
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
  {
    ignores: ['node_modules/**', '.next/**', 'out/**'],
  },
];

export default eslintConfig;
