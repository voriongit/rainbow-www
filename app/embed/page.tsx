// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Vorion LLC

/**
 * Embed configurator — a gallery of the RAINBOW embeddable widgets. Each entry
 * shows a LIVE preview (an iframe pointing at the real /embed/* route) plus a
 * copy-paste <iframe> snippet. RSC throughout; only the per-snippet copy button
 * is a client island. Read-only — the previews render the same deterministic,
 * synthetic data as the dashboard, and every widget self-labels as a synthetic
 * demo.
 */

import type { Metadata } from 'next';
import { ensureHydrated, getAgents } from '../lib/data-source';
import { CopyButton } from './copy-button';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Embeddable widgets — RAINBOW — Vorion',
  description:
    'Copy-paste iframe widgets over the RAINBOW Trust Analytics Observatory: a tier-spectrum mini, a single-agent trust card, and a fleet-health badge — all read-only over a deterministic synthetic simulator.',
};

/** The public origin used in the copy-paste snippets. */
const ORIGIN = 'https://rainbow.vorion.org';

interface WidgetDef {
  key: string;
  name: string;
  blurb: string;
  /** Path relative to origin (the iframe src). */
  path: string;
  /** Suggested iframe size for the snippet + preview. */
  width: number;
  height: number;
}

export default async function EmbedConfiguratorPage() {
  await ensureHydrated();
  // Pick a real agent from the roster so the agent-card preview is live, not a
  // placeholder. Falls back to a stable id if the roster is somehow empty.
  const agents = getAgents();
  const sampleAgent = agents[0]?.agentId ?? 'cascade-03';

  const widgets: WidgetDef[] = [
    {
      key: 'spectrum',
      name: 'Tier spectrum mini',
      blurb:
        'Fleet trust distribution across the eight tiers (T0–T7) as a compact rainbow ribbon with per-tier counts.',
      path: '/embed/spectrum?window=24h',
      width: 420,
      height: 150,
    },
    {
      key: 'agent',
      name: 'Agent trust card',
      blurb:
        'One agent at a glance: id, tier chip, current trust score, and windowed trend.',
      path: `/embed/agent/${sampleAgent}?window=24h`,
      width: 420,
      height: 170,
    },
    {
      key: 'fleet',
      name: 'Fleet-health badge',
      blurb: 'A summary chip: fleet mean score, the tier it falls in, and the agent count.',
      path: '/embed/fleet?window=24h',
      width: 420,
      height: 130,
    },
  ];

  function snippet(w: WidgetDef): string {
    return `<iframe src="${ORIGIN}${w.path}" width="${w.width}" height="${w.height}" style="border:0;border-radius:12px;color-scheme:dark" loading="lazy" title="RAINBOW — ${w.name}"></iframe>`;
  }

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-8 px-4 py-10 sm:px-6 lg:px-8">
      <header className="flex flex-col gap-2">
        <div
          className="h-px w-full rounded-full opacity-60"
          style={{
            backgroundImage:
              'linear-gradient(90deg,#6b7280,#ef4444,#f97316,#eab308,#22c55e,#06b6d4,#6366f1,#a855f7)',
          }}
          aria-hidden="true"
        />
        <h1 className="mt-3 text-xl font-bold tracking-tight text-white/90">
          Embeddable RAINBOW widgets
        </h1>
        <p className="max-w-2xl text-sm text-white/55">
          Drop a live RAINBOW widget into any page with a single{' '}
          <code className="rounded bg-white/[0.06] px-1 py-0.5 font-mono text-[12px] text-white/70">
            &lt;iframe&gt;
          </code>
          . Every widget is read-only over a deterministic synthetic simulator and self-labels as a
          synthetic demo — they visualize trust analytics; they do not control agents. Add{' '}
          <code className="rounded bg-white/[0.06] px-1 py-0.5 font-mono text-[12px] text-white/70">
            ?window=
          </code>{' '}
          (1h, 24h, 7d, 30d) to change the span.
        </p>
      </header>

      <div className="flex flex-col gap-6">
        {widgets.map((w) => (
          <section
            key={w.key}
            className="rounded-xl border border-white/10 bg-white/[0.02] p-5"
          >
            <header className="mb-4 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <h2 className="text-sm font-semibold tracking-wide text-white/90">{w.name}</h2>
              <p className="font-mono text-[11px] text-white/40">{w.path}</p>
            </header>
            <p className="mb-4 max-w-2xl text-xs text-white/55">{w.blurb}</p>

            {/* Live preview — the real /embed route in an iframe. */}
            <div className="overflow-hidden rounded-lg border border-white/10 bg-black/20">
              <iframe
                src={w.path}
                width={w.width}
                height={w.height}
                className="block w-full"
                style={{ border: 0, colorScheme: 'dark' }}
                loading="lazy"
                title={`Preview — ${w.name}`}
              />
            </div>

            {/* Copy-paste snippet. */}
            <div className="mt-4 flex items-start gap-2">
              <pre className="min-w-0 flex-1 overflow-x-auto rounded-lg border border-white/10 bg-black/30 p-3 font-mono text-[11px] leading-relaxed text-white/70">
                <code>{snippet(w)}</code>
              </pre>
              <CopyButton value={snippet(w)} label="Copy" />
            </div>
          </section>
        ))}
      </div>

      <p className="text-[11px] leading-relaxed text-white/35">
        Widgets render synthetic, deterministic demo data and are intended for illustration. The
        bottom navigation bar is part of the full site chrome and is hidden on the widget routes at
        embed sizes (it is mobile-only and fixed). Host the iframe at the suggested width/height for
        the cleanest fit.
      </p>
    </main>
  );
}
