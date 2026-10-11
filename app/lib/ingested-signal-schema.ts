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
import { MAX_TRUST_SCORE, MIN_TRUST_SCORE, RISK_LEVELS } from '@vorionsys/basis-spec';

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

/**
 * BASIS action risk levels (READ, LOW, MEDIUM, HIGH, CRITICAL, LIFE_CRITICAL).
 * The risk accumulator looks these up by exact key, so a value outside this set
 * would be silently left out of it. Reject it here instead, and accept any
 * letter case: `critical` from a producer using the contracts RiskLevel
 * vocabulary becomes `CRITICAL`.
 */
export const RISK_LEVEL_KEYS = Object.keys(RISK_LEVELS) as [string, ...string[]];

const riskLevelSchema = z
  .string()
  .max(200)
  .transform((value) => value.trim().toUpperCase())
  .pipe(z.enum(RISK_LEVEL_KEYS));

/** Highest canonical trust tier index (T0-T7). */
const MAX_TIER_INDEX = 7;

export const ingestedSignalSchema = z.object({
  signalId: z.string().min(1).max(200),
  agentId: z.string().min(1).max(200),
  tenantId: z.string().min(1).max(200),
  timestamp: z.coerce.date(),
  busSignalType: z.enum(BUS_SIGNAL_TYPES).optional(),
  severity: z.enum(BUS_SEVERITIES).optional(),
  success: z.boolean(),
  factorCode: z.string().max(200).optional(),
  riskLevel: riskLevelSchema.optional(),
  delta: z.number().finite().min(-MAX_TRUST_SCORE).max(MAX_TRUST_SCORE),
  blocked: z.boolean(),
  blockReason: z.string().max(1000).optional(),
  correlationId: z.string().max(200).optional(),
  scoreAfter: z.number().finite().min(MIN_TRUST_SCORE).max(MAX_TRUST_SCORE).optional(),
  tierAfter: z.number().int().min(0).max(MAX_TIER_INDEX).optional(),
  /**
   * Free-form producer metadata. `observationTier` is read here when present;
   * an agent that does not declare one is treated as BLACK_BOX, which is the
   * accurate reading — undeclared observability IS black-box, not unknown.
   */
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type ValidatedIngestedSignal = z.infer<typeof ingestedSignalSchema>;

/** Most signals accepted in one request. */
export const MAX_BATCH = 1000;

export interface IngestIssue {
  /** Where the problem is: `delta` for a single signal, `[3].delta` within a batch. */
  path: string;
  message: string;
}

export type IngestBodyResult =
  | { ok: true; signals: ValidatedIngestedSignal[] }
  | { ok: false; error: string; issues: IngestIssue[] };

function formatPath(path: ReadonlyArray<PropertyKey>, batch: boolean): string {
  const [index, ...rest] = path;
  const fields = rest.map(String).join('.');
  if (!batch) return fields;
  return fields ? `[${String(index)}].${fields}` : `[${String(index)}]`;
}

/**
 * Validate a request body: one signal, or an array of 1 to MAX_BATCH.
 *
 * Each signal is checked on its own so a problem is reported at its own path.
 * Validating "one signal OR an array" as a single union would report any bad
 * field as one opaque issue with an empty path, which tells a producer nothing
 * about which signal or field to fix.
 */
export function parseIngestBody(body: unknown): IngestBodyResult {
  const batch = Array.isArray(body);
  const items = batch ? body : [body];

  if (items.length < 1 || items.length > MAX_BATCH) {
    return {
      ok: false,
      error: `Send between 1 and ${MAX_BATCH} signals per request`,
      issues: [],
    };
  }

  const parsed = z.array(ingestedSignalSchema).safeParse(items);
  if (!parsed.success) {
    return {
      ok: false,
      error: 'Invalid signal',
      issues: parsed.error.issues.slice(0, 20).map((issue) => ({
        path: formatPath(issue.path, batch),
        message: issue.message,
      })),
    };
  }
  return { ok: true, signals: parsed.data };
}
