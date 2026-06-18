// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Vorion LLC

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // App-like cross-fade between routes (styled in globals.css; reduced-motion safe).
    viewTransition: true,
  },
};

module.exports = nextConfig;
