// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Vorion LLC

interface StatProps {
  label: string;
  value: string;
  sub?: string;
  color?: string;
}

/** Compact metric tile */
export function Stat({ label, value, sub, color }: StatProps) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.02] px-4 py-3">
      <p className="text-[11px] uppercase tracking-wider text-white/40">{label}</p>
      <p className="mt-1 text-xl font-bold" style={color ? { color } : undefined}>
        {value}
      </p>
      {sub && <p className="mt-0.5 text-[11px] text-white/45">{sub}</p>}
    </div>
  );
}
