// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Vorion LLC

import type { Metadata } from 'next';
import { Analytics } from '@vercel/analytics/next';
import { Inter } from 'next/font/google';
import { TRUST_FACTORS } from '@vorionsys/basis-spec';
import './globals.css';
import { getAgents } from './lib/data-source';
import { CONCEPTS } from './lib/glossary';
import { TIER_ORDER, tierName } from './lib/tiers';
import { CommandPalette, type CommandItem } from './components/command-palette';

const inter = Inter({ subsets: ['latin'], display: 'swap' });

/** Build the global command-palette index (server-side, from live + canonical data). */
function buildCommandItems(): CommandItem[] {
  const pages: CommandItem[] = [
    { kind: 'page', label: 'Dashboard', href: '/' },
    { kind: 'page', label: 'Concepts glossary', href: '/concepts' },
    { kind: 'page', label: 'Compare agents', href: '/compare' },
  ];
  const agents: CommandItem[] = getAgents().map((a) => ({
    kind: 'agent',
    label: a.agentId,
    sublabel: `${a.label} · ${a.tier}`,
    href: `/agent/${a.agentId}`,
  }));
  const tiers: CommandItem[] = TIER_ORDER.map((t) => ({
    kind: 'tier',
    label: `${t} · ${tierName(t)}`,
    href: `/tier/${t}`,
  }));
  const factors: CommandItem[] = Object.entries(TRUST_FACTORS).map(([code, spec]) => ({
    kind: 'factor',
    label: `${code} · ${(spec as { name: string }).name}`,
    href: `/factor/${code}`,
  }));
  const concepts: CommandItem[] = CONCEPTS.map((c) => ({
    kind: 'concept',
    label: c.term,
    sublabel: c.category,
    href: `/concepts/${c.slug}`,
  }));
  return [...pages, ...agents, ...tiers, ...factors, ...concepts];
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

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={inter.className}>
      <body className="bg-[#05050a] text-white antialiased">
        {children}
        <CommandPalette items={buildCommandItems()} />
        <Analytics />
      </body>
    </html>
  );
}
