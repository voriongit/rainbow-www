// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Vorion LLC

import type { MetadataRoute } from 'next';

/**
 * Web App Manifest (Next metadata route → /manifest.webmanifest). Makes RAINBOW
 * installable to the home screen and launchable full-screen. Colors match the
 * dark dashboard so the splash/standalone chrome is seamless. Copy stays within
 * the claim vocabulary — "audit infrastructure / trust telemetry / observability",
 * never "governs".
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'RAINBOW — Trust Analytics Observatory',
    short_name: 'RAINBOW',
    description:
      'Audit infrastructure for AI agents — trust telemetry, tier trajectories, factor health, and delegation-health observability.',
    start_url: '/?source=pwa',
    scope: '/',
    display: 'standalone',
    orientation: 'any',
    background_color: '#05050a',
    theme_color: '#05050a',
    categories: ['productivity', 'business', 'utilities'],
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-192-maskable.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/icons/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
