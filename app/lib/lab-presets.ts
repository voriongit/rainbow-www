// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Vorion LLC

/**
 * Named risk-tolerance presets for the /lab what-if playground. Each preset is a
 * one-tap BUNDLE of the three granular routing/trigger knobs (handler pool,
 * security-lead routing, escalation threshold) framed as an operator risk
 * posture. Presets are *defaults, not limits* — every knob stays individually
 * reachable, and any combination that matches no preset reads as "Custom".
 *
 * Pure + dependency-free (type-only import) so both the server page and the
 * client controls share one source of truth. Like the rest of /lab these select
 * a MODELED policy over the synthetic, seeded stream only — never the simulator
 * or any real agent.
 */

import type { LeadRouting, EscalationThreshold } from './delegation-service';

export interface RiskPreset {
  id: 'strict' | 'balanced' | 'permissive';
  label: string;
  /** One-line operator-facing description of the posture. */
  hint: string;
  handlers: number;
  lead: LeadRouting;
  esc: EscalationThreshold;
}

// Lower risk tolerance = escalate earlier (warning), spread oversight
// (distributed, no single lead → less policy-induced concentration), more
// handler capacity. Higher tolerance = escalate only at the breaker, concentrate
// on a single lead (the collusion driver).
export const RISK_PRESETS: readonly RiskPreset[] = [
  {
    id: 'strict',
    label: 'Strict',
    hint: 'Low risk tolerance — escalate at the first warning, spread across a wide distributed handler pool.',
    handlers: 5,
    lead: 'distributed',
    esc: 'warning',
  },
  {
    id: 'balanced',
    label: 'Balanced',
    hint: 'Moderate — escalate once risk is degraded, distributed routing, mid-size handler pool.',
    handlers: 3,
    lead: 'distributed',
    esc: 'degraded',
  },
  {
    id: 'permissive',
    label: 'Permissive',
    hint: 'High risk tolerance — only escalate at a circuit-breaker trip, concentrated on a single lead.',
    handlers: 2,
    lead: 'concentrated',
    esc: 'breaker',
  },
] as const;

export type PresetId = RiskPreset['id'] | 'custom';

/** The preset the impact delta is measured against ("Impact vs Balanced"). */
export const BASELINE_PRESET_ID: RiskPreset['id'] = 'balanced';

export const BASELINE_PRESET: RiskPreset = RISK_PRESETS.find(
  (p) => p.id === BASELINE_PRESET_ID
)!;

/** Identify which preset (if any) a knob bundle matches; 'custom' otherwise. */
export function presetIdFor(state: {
  handlers: number;
  lead: LeadRouting;
  esc: EscalationThreshold;
}): PresetId {
  const match = RISK_PRESETS.find(
    (p) => p.handlers === state.handlers && p.lead === state.lead && p.esc === state.esc
  );
  return match ? match.id : 'custom';
}

/** Human label for a resolved preset id (incl. 'custom'). */
export function presetLabel(id: PresetId): string {
  if (id === 'custom') return 'Custom';
  return RISK_PRESETS.find((p) => p.id === id)!.label;
}
