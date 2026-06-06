// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Vorion LLC

/** Streaming fallback — skeleton panels while the RSC tree renders */
export default function Loading() {
  return (
    <main className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
      <div className="h-16 animate-pulse rounded-xl bg-white/[0.04]" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-20 animate-pulse rounded-lg bg-white/[0.04]" />
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="h-80 animate-pulse rounded-xl bg-white/[0.04] lg:col-span-2" />
        <div className="h-80 animate-pulse rounded-xl bg-white/[0.04]" />
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="h-80 animate-pulse rounded-xl bg-white/[0.04] lg:col-span-2" />
        <div className="h-80 animate-pulse rounded-xl bg-white/[0.04]" />
      </div>
      <p className="text-center text-xs text-white/30">Computing analytics windows…</p>
    </main>
  );
}
