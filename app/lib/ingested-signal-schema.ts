// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Vorion LLC

/**
 * Runtime validator for rainbow's `IngestedSignal` — the contract a real
 * producer must satisfy to POST /api/signals.
 *
 * Why local, not imported from @vorionsys/contracts: `IngestedSignal`
 * (rainbow collector/collector-types.ts) is a plain TS interface with no
 * runtime validator anywhere in rainbow, and contracts' published Zod schemas
 * describe a different shape (trustBusSignalSchema is a cross-layer routing
 * envelope; trustSignalSchema requires type/source/impact that IngestedSignal
 * lacks). Mirrored from the same shape the rainbow-interop harness validates
 * against — when contracts republishes the rainbow-era trust-bus surface this
 * file can become a re-export.
 *
 * NOTE: written for zod v4 (z.record takes an explicit key schema).
 */

import { z } from 'zod';

/** Mirrors rainbow's vendored BusSeverity values. */
export const BUS_SEVERITIES = ['low', 'medium', 'high', 'critical', 'emergency'] as const;

/** Mirrors rainbow's vendored BusSignalType values. */
export const BUS_SIGNAL_TYPES = [
  'threat_detected',
  'anomaly',
  'drift',
  'probe_detected',
  'rotation_triggered',
  'policy_tightened',
  'trust_updated',
  'canary_passed',
  'canary_failed',
  'dormancy_deduction',
  'risk_accumulator_warning',
  'risk_accumulator_degraded',
  'circuit_breaker_tripped',
  'trend_detected',
  'fleet_anomaly',
] as const;

/** Observation tiers a producer may declare (basis-spec OBSERVATION_TIERS). */
export const OBSERVATION_TIER_KEYS = [
  'BLACK_BOX',
  'GRAY_BOX',
  'WHITE_BOX',
  'ATTESTED_BOX',
  'VERIFIED_BOX',
] as const;

export const ingestedSignalSchema = z.object({
  signalId: z.string().min(1).max(200),
  agentId: z.string().min(1).max(200),
  tenantId: z.string().min(1).max(200),
  timestamp: z.coerce.date(),
  busSignalType: z.enum(BUS_SIGNAL_TYPES).optional(),
  severity: z.enum(BUS_SEVERITIES).optional(),
  success: z.boolean(),
  factorCode: z.string().max(200).optional(),
  riskLevel: z.string().max(200).optional(),
  delta: z.number().finite(),
  blocked: z.boolean(),
  blockReason: z.string().max(1000).optional(),
  correlationId: z.string().max(200).optional(),
  scoreAfter: z.number().finite().optional(),
  tierAfter: z.number().optional(),
  /**
   * Free-form producer metadata. `observationTier` is read here when present;
   * an agent that does not declare one is treated as BLACK_BOX, which is the
   * accurate reading — undeclared observability IS black-box, not unknown.
   */
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type ValidatedIngestedSignal = z.infer<typeof ingestedSignalSchema>;

/** A batch POST body: one signal or an array of them. */
export const ingestBodySchema = z.union([
  ingestedSignalSchema,
  z.array(ingestedSignalSchema).min(1).max(1000),
]);
