// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Vorion LLC

import type { Metadata, Viewport } from 'next';
import { Analytics } from '@vercel/analytics/next';
import { Inter } from 'next/font/google';
import { TRUST_FACTORS } from '@vorionsys/basis-spec';
import './globals.css';
import { getAgents } from './lib/data-source';
import { CONCEPTS } from './lib/glossary';
import { TIER_ORDER, tierName } from './lib/tiers';
import { CommandPalette, type CommandItem } from './components/command-palette';
import { MobileNav } from './components/mobile-nav';

const inter = Inter({ subsets: ['latin'], display: 'swap' });

// Static command items (pages + canonical tiers/factors/concepts) never change,
// so build them ONCE at module load instead of on every layout render. Only the
// agent roster is per-request. Order is preserved (pages, agents, then taxonomy)
// so the palette's default (no-query) top-N display is unchanged.
const STATIC_PAGES: CommandItem[] = [
  { kind: 'page', label: 'Dashboard', href: '/' },
  { kind: 'page', label: 'Concepts glossary', href: '/concepts' },
  { kind: 'page', label: 'Compare agents', href: '/compare' },
];
const STATIC_TAXONOMY: CommandItem[] = [
  ...TIER_ORDER.map(
    (t): CommandItem => ({ kind: 'tier', label: `${t} · ${tierName(t)}`, href: `/tier/${t}` })
  ),
  ...Object.entries(TRUST_FACTORS).map(
    ([code, spec]): CommandItem => ({
      kind: 'factor',
      label: `${code} · ${(spec as { name: string }).name}`,
      href: `/factor/${code}`,
    })
  ),
  ...CONCEPTS.map(
    (c): CommandItem => ({ kind: 'concept', label: c.term, sublabel: c.category, href: `/concepts/${c.slug}` })
  ),
];

/** Build the global command-palette index (server-side, from live + canonical data). */
function buildCommandItems(): CommandItem[] {
  const agents: CommandItem[] = getAgents().map((a) => ({
    kind: 'agent',
    label: a.agentId,
    sublabel: `${a.label} · ${a.tier}`,
    href: `/agent/${a.agentId}`,
  }));
  return [...STATIC_PAGES, ...agents, ...STATIC_TAXONOMY];
}

export const metadata: Metadata = {
  title: 'RAINBOW — Trust Analytics Observatory — Vorion',
  description:
    'Read-only observability dashboard for RAINBOW (Recorded Analytics Involving Non-Binary Orchestration Window): trust trajectories, tier distribution, risk accumulator trends, factor health, and fleet anomaly clustering over a simulated Trust Signal Bus stream.',
  icons: {
    icon: '/favicon.svg',
    apple: '/favicon.svg',
  },
  openGraph: {
    title: 'RAINBOW — Trust Analytics Observatory — Vorion',
    description:
      'Read-only observability dashboard for RAINBOW trust analytics: trajectories, tier distribution, risk trends, factor health, and fleet anomaly clustering.',
    siteName: 'Vorion RAINBOW',
    type: 'website',
  },
  twitter: {
    card: 'summary',
    title: 'RAINBOW — Trust Analytics Observatory — Vorion',
    description:
      'Read-only observability dashboard for RAINBOW trust analytics over a simulated Trust Signal Bus stream.',
  },
};

export const viewport: Viewport = {
  // Matches the body background so the mobile browser chrome + PWA status bar
  // blend into the dark dashboard. `cover` is required for env(safe-area-inset-*)
  // to be non-zero on notched devices (used by the bottom nav + safe-area utils).
  themeColor: '#05050a',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={inter.className}>
      {/* Bottom padding clears the fixed mobile nav (mobile only); desktop unaffected. */}
      <body className="bg-[#05050a] text-white antialiased pb-[calc(4rem+env(safe-area-inset-bottom))] md:pb-0">
        {children}
        <CommandPalette items={buildCommandItems()} />
        <MobileNav />
        <Analytics />
      </body>
    </html>
  );
}
