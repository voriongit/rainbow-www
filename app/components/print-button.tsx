// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Vorion LLC

'use client';

/**
 * The only client component on the /report route: a thin trigger for the
 * browser's native print dialog ("Save as PDF"). No state, no storage — it
 * simply calls window.print(). It carries `print:hidden` so it never appears
 * in the printed/exported output.
 */

import { Printer } from 'lucide-react';

export function PrintButton({ className }: { className?: string }) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      aria-label="Print or save this report as PDF"
      className={`inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-white/75 transition-colors hover:bg-white/[0.08] hover:text-white focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/40 print:hidden ${className ?? ''}`}
    >
      <Printer size={14} aria-hidden="true" />
      <span>Print / Save as PDF</span>
    </button>
  );
}
