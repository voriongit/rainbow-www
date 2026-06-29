// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Vorion LLC

// Cloudflare Workers build (via OpenNext) needs Next's standalone output. Gate it on
// an env var so the default/Vercel build path is unaffected; set by the `build:cf` script.
const isCfWorkerBuild = process.env.CF_WORKER_BUILD === "1";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  ...(isCfWorkerBuild ? { output: "standalone" } : {}),
  experimental: {
    // App-like cross-fade between routes (styled in globals.css; reduced-motion safe).
    viewTransition: true,
  },
};

module.exports = nextConfig;
