// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Vorion LLC

import type { ReactNode } from 'react';
import { Tooltip } from './tooltip';

interface StatProps {
  label: ReactNode;
  value: string;
  sub?: string;
  color?: string;
  /** Optional hover/focus explanation of what the value means. */
  tip?: ReactNode;
}

/** Compact metric tile */
export function Stat({ label, value, sub, color, tip }: StatProps) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.02] px-4 py-3">
      <p className="text-[11px] uppercase tracking-wider text-white/55">{label}</p>
      {tip ? (
        <p className="mt-1">
          <Tooltip
            content={tip}
            className="cursor-help text-xl font-bold underline decoration-dotted decoration-white/25 underline-offset-4"
          >
            <span style={color ? { color } : undefined}>{value}</span>
          </Tooltip>
        </p>
      ) : (
        <p className="mt-1 text-xl font-bold" style={color ? { color } : undefined}>
          {value}
        </p>
      )}
      {sub && <p className="mt-0.5 text-[11px] text-white/55">{sub}</p>}
    </div>
  );
}
