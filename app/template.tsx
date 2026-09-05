// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Vorion LLC

import { ensureHydrated } from './lib/data-source';

/** Every navigation awaits hydrate so live reads never see an empty mirror. */
export default async function Template({ children }: { children: React.ReactNode }) {
  await ensureHydrated();
  return children;
}
