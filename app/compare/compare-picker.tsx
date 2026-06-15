// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Vorion LLC

'use client';

/**
 * Side-by-side agent picker for the comparison view. Two native selects choose
 * agents A and B; each navigates (state lives in the URL, no browser storage)
 * carrying the active window. Matches the agent-selector house style.
 */

import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { exploreHref } from '../components/explore-link';

interface AgentOption {
  agentId: string;
  label: string;
  tier: string;
}

interface ComparePickerProps {
  agents: AgentOption[];
  a: string;
  b: string;
  window: string;
}

export function ComparePicker({ agents, a, b, window }: ComparePickerProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function go(nextA: string, nextB: string) {
    startTransition(() => {
      router.push(exploreHref('/compare', { a: nextA, b: nextB, window }), {
        scroll: false,
      });
    });
  }

  const selectClass = `rounded-lg border border-white/10 bg-[#0c0c14] px-3 py-1.5 text-xs font-medium text-white outline-none focus-visible:ring-1 focus-visible:ring-white/30 focus:border-white/30 ${
    isPending ? 'opacity-60' : ''
  }`;

  return (
    <div className="flex flex-wrap items-center gap-4">
      <label className="flex items-center gap-2 text-xs text-white/50">
        Agent A
        <select
          value={a}
          onChange={(e) => go(e.target.value, b)}
          className={selectClass}
        >
          {agents.map((opt) => (
            <option key={opt.agentId} value={opt.agentId}>
              {opt.agentId} · {opt.tier} · {opt.label}
            </option>
          ))}
        </select>
      </label>
      <label className="flex items-center gap-2 text-xs text-white/50">
        Agent B
        <select
          value={b}
          onChange={(e) => go(a, e.target.value)}
          className={selectClass}
        >
          {agents.map((opt) => (
            <option key={opt.agentId} value={opt.agentId}>
              {opt.agentId} · {opt.tier} · {opt.label}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
