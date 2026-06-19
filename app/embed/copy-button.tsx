'use client';

// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Vorion LLC

/**
 * Tiny copy-to-clipboard button for the embed configurator. The ONLY client
 * component under /embed — everything else is RSC. Zero dependencies beyond the
 * clipboard API, with a graceful fallback when it is unavailable.
 */

import { useState } from 'react';

export function CopyButton({ value, label = 'Copy' }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard unavailable (e.g. insecure context) — leave the snippet
      // visible for manual selection rather than failing loudly.
      setCopied(false);
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      className="shrink-0 rounded-md border border-white/15 bg-white/[0.04] px-2.5 py-1 text-[11px] font-semibold text-white/75 transition-colors hover:border-white/30 hover:text-white"
    >
      {copied ? 'Copied' : label}
    </button>
  );
}
