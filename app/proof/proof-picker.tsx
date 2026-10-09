// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Vorion LLC

'use client';

/**
 * Agent + window + ordering picker for the proof-chain visualizer. Native
 * controls navigate on change; all state lives in the URL (no browser storage),
 * matching the house selector idiom.
 */

import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { exploreHref } from '../components/explore-link';

interface AgentOption {
  agentId: string;
  label: string;
  tier: string;
}

interface ProofPickerProps {
  agents: AgentOption[];
  agent: string;
  window: string;
  windows: string[];
  order: 'newest' | 'oldest';
}

export function ProofPicker({
  agents,
  agent,
  window,
  windows,
  order,
}: ProofPickerProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function go(next: { agent?: string; window?: string; order?: string }) {
    startTransition(() => {
      router.push(
        exploreHref('/proof', {
          agent: next.agent ?? agent,
          window: next.window ?? window,
          order: (next.order ?? order) === 'newest' ? undefined : next.order ?? order,
        }),
        { scroll: false }
      );
    });
  }

  const selectClass = `rounded-lg border border-white/10 bg-[#0c0c14] px-3 py-1.5 text-xs font-medium text-white outline-none focus-visible:ring-1 focus-visible:ring-white/30 focus:border-white/30 ${
    isPending ? 'opacity-60' : ''
  }`;

  return (
    <div className="flex flex-wrap items-center gap-4">
      <label className="flex items-center gap-2 text-xs text-white/50">
        Agent
        <select
          value={agent}
          onChange={(e) => go({ agent: e.target.value })}
          className={selectClass}
        >
          {agents.map((opt) => (
            <option key={opt.agentId} value={opt.agentId}>
              {opt.agentId} · {opt.tier}
              {opt.label !== opt.agentId ? ` · archetype: ${opt.label}` : ''}
            </option>
          ))}
        </select>
      </label>

      <div
        className={`flex rounded-lg border border-white/10 bg-white/[0.03] p-0.5 ${
          isPending ? 'opacity-60' : ''
        }`}
        role="group"
        aria-label="Time window"
      >
        {windows.map((w) => (
          <button
            key={w}
            type="button"
            aria-pressed={w === window}
            onClick={() => go({ window: w })}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              w === window ? 'bg-white/10 text-white' : 'text-white/50 hover:text-white/80'
            }`}
          >
            {w}
          </button>
        ))}
      </div>

      <div
        className={`flex rounded-lg border border-white/10 bg-white/[0.03] p-0.5 ${
          isPending ? 'opacity-60' : ''
        }`}
        role="group"
        aria-label="Trace ordering"
      >
        {(['newest', 'oldest'] as const).map((o) => (
          <button
            key={o}
            type="button"
            aria-pressed={o === order}
            onClick={() => go({ order: o })}
            className={`rounded-md px-3 py-1.5 text-xs font-medium capitalize transition-colors ${
              o === order ? 'bg-white/10 text-white' : 'text-white/50 hover:text-white/80'
            }`}
          >
            {o} first
          </button>
        ))}
      </div>
    </div>
  );
}
