// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Vorion LLC

'use client';

/**
 * Agent selector for the per-agent panels. Client component by necessity
 * (navigation on change); state lives in the URL — no browser storage.
 */

import { useRouter } from 'next/navigation';
import { useTransition } from 'react';

interface AgentOption {
  agentId: string;
  label: string;
  tier: string;
}

interface AgentSelectorProps {
  agents: AgentOption[];
  current: string;
  duration: string;
}

export function AgentSelector({ agents, current, duration }: AgentSelectorProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <label className="flex items-center gap-2 text-xs text-white/50">
      Agent
      <select
        value={current}
        onChange={(e) =>
          startTransition(() => {
            router.push(
              `/?window=${duration}&agent=${encodeURIComponent(e.target.value)}`,
              { scroll: false }
            );
          })
        }
        className={`rounded-lg border border-white/10 bg-[#0c0c14] px-3 py-1.5 text-xs font-medium text-white outline-none focus:border-white/30 ${
          isPending ? 'opacity-60' : ''
        }`}
      >
        {agents.map((a) => (
          <option key={a.agentId} value={a.agentId}>
            {a.agentId} · {a.tier} · {a.label}
          </option>
        ))}
      </select>
    </label>
  );
}
