// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Vorion LLC

/**
 * What the live deployment shows instead of a dashboard when it has nothing real
 * to show: the store is not configured, cannot be read, or no agent has reported.
 * An empty fleet drawn as if it were data reads as "everything is fine"; this
 * says what is actually true.
 */

export function LiveUnavailable({ reason }: { reason: string }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-5 px-6 py-16">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-white/45">
        RAINBOW · Live
      </p>
      <h1 className="text-2xl font-extrabold tracking-tight text-white">No live telemetry to show</h1>
      <p role="status" className="rounded-lg border border-amber-500/30 bg-amber-500/[0.06] px-4 py-3 text-sm leading-relaxed text-amber-100/90">
        {reason}
      </p>
      <div className="space-y-2 text-sm leading-relaxed text-white/60">
        <p>
          This private view only ever shows signals reported by real agents; it never falls back to
          the synthetic demo. Producers send signals with{' '}
          <code className="rounded bg-white/10 px-1.5 py-0.5 text-xs text-white/80">POST /api/signals</code>{' '}
          and a bearer token. Retrying a batch is safe: a signal already stored is skipped.
        </p>
        <p>This page checks again on every load.</p>
      </div>
    </main>
  );
}
