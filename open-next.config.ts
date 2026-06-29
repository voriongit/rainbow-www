// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Vorion LLC
//
// OpenNext adapter config — deploys this Next.js app to Cloudflare Workers.
//   npm run build:cf    -> compile to .open-next/
//   npm run preview:cf  -> local wrangler dev against the built worker
//   npm run deploy:cf   -> publish to Cloudflare Workers
import { defineCloudflareConfig } from "@opennextjs/cloudflare";

export default defineCloudflareConfig();
