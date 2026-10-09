// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Vorion LLC

// Cloudflare Workers build (via OpenNext) needs Next's standalone output. Gate it on
// an env var so the default/Vercel build path is unaffected; set by the `build:cf` script.
const isCfWorkerBuild = process.env.CF_WORKER_BUILD === "1";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  ...(isCfWorkerBuild ? { output: "standalone" } : {}),
  // helix-13 / wisp-14 were renumbered to helix-12 / wisp-13 (same seeded
  // stream) so the demo roster runs 01–13 without a gap. Keep old links working.
  async redirects() {
    return [
      { source: "/agent/helix-13", destination: "/agent/helix-12", permanent: true },
      { source: "/agent/wisp-14", destination: "/agent/wisp-13", permanent: true },
      { source: "/control/helix-13", destination: "/control/helix-12", permanent: true },
      { source: "/control/wisp-14", destination: "/control/wisp-13", permanent: true },
    ];
  },
  experimental: {
    // App-like cross-fade between routes (styled in globals.css; reduced-motion safe).
    viewTransition: true,
  },
};

module.exports = nextConfig;
