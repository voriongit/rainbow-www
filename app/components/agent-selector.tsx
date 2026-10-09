// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Vorion LLC

'use client';

/**
 * Scope selector: the whole fleet (default) or one agent. Client component by
 * necessity (navigation on change); state lives in the URL — no browser storage.
 *
 * In the demo, an agent's label is its SCRIPTED archetype (what the simulator
 * was told to do), not its computed trend, so it is prefixed "archetype:" —
 * the trajectory panel is where the current trend is read.
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
  /** Selected agent id; empty string = fleet scope. */
  current: string;
  duration: string;
  /** When true, labels are scripted demo archetypes, not computed state. */
  archetypes?: boolean;
}

export function AgentSelector({ agents, current, duration, archetypes = false }: AgentSelectorProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <label className="flex items-center gap-2 text-xs text-white/55">
      Scope
      <select
        aria-label="Scope: whole fleet or one agent"
        value={current}
        onChange={(e) =>
          startTransition(() => {
            const agent = e.target.value;
            router.push(
              agent
                ? `/?window=${duration}&agent=${encodeURIComponent(agent)}`
                : `/?window=${duration}`,
              { scroll: false }
            );
          })
        }
        className={`max-w-[72vw] rounded-lg border border-white/10 bg-[#0c0c14] px-3 py-1.5 text-base sm:text-xs font-medium text-white outline-none focus:border-white/30 ${
          isPending ? 'opacity-60' : ''
        }`}
      >
        <option value="">Fleet · all {agents.length} agents</option>
        <optgroup label={archetypes ? 'Agent · tier · scripted archetype' : 'Agent · tier'}>
          {agents.map((a) => (
            <option key={a.agentId} value={a.agentId}>
              {a.agentId} · {a.tier}
              {archetypes ? ` · archetype: ${a.label}` : ''}
            </option>
          ))}
        </optgroup>
      </select>
    </label>
  );
}
