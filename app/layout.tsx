// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Vorion LLC

import type { Metadata } from 'next';
import { Analytics } from '@vercel/analytics/next';
import './globals.css';

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
    <html lang="en">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="bg-[#05050a] text-white antialiased font-sans">
        {children}
        <Analytics />
      </body>
    </html>
  );
}
