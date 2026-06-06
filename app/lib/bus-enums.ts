// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Vorion LLC

/**
 * Local mirror of the Trust Signal Bus enum VALUES vendored inside
 * `@vorionsys/rainbow/src/contracts-stubs.ts`. The package types
 * `IngestedSignal.busSignalType` / `.severity` against those enums but does
 * not export them through its public entry points, so we mirror the string
 * values here and narrow via the helpers below.
 *
 * If `@vorionsys/contracts` is republished with the rainbow-era trust-bus
 * surface, replace this file with re-exports from there.
 */

import type { IngestedSignal } from '@vorionsys/rainbow';

export type BusSignalType = NonNullable<IngestedSignal['busSignalType']>;
export type BusSeverity = NonNullable<IngestedSignal['severity']>;

/** Bus signal type values (mirrors rainbow's contracts-stubs BusSignalType) */
export const SIG = {
  THREAT_DETECTED: 'threat_detected' as BusSignalType,
  ANOMALY: 'anomaly' as BusSignalType,
  DRIFT: 'drift' as BusSignalType,
  PROBE_DETECTED: 'probe_detected' as BusSignalType,
  ROTATION_TRIGGERED: 'rotation_triggered' as BusSignalType,
  POLICY_TIGHTENED: 'policy_tightened' as BusSignalType,
  TRUST_UPDATED: 'trust_updated' as BusSignalType,
  CANARY_PASSED: 'canary_passed' as BusSignalType,
  CANARY_FAILED: 'canary_failed' as BusSignalType,
  DORMANCY_DEDUCTION: 'dormancy_deduction' as BusSignalType,
  RISK_ACCUMULATOR_WARNING: 'risk_accumulator_warning' as BusSignalType,
  RISK_ACCUMULATOR_DEGRADED: 'risk_accumulator_degraded' as BusSignalType,
  CIRCUIT_BREAKER_TRIPPED: 'circuit_breaker_tripped' as BusSignalType,
  TREND_DETECTED: 'trend_detected' as BusSignalType,
  FLEET_ANOMALY: 'fleet_anomaly' as BusSignalType,
} as const;

/** Bus severity values (mirrors rainbow's contracts-stubs BusSeverity) */
export const SEV = {
  LOW: 'low' as BusSeverity,
  MEDIUM: 'medium' as BusSeverity,
  HIGH: 'high' as BusSeverity,
  CRITICAL: 'critical' as BusSeverity,
  EMERGENCY: 'emergency' as BusSeverity,
} as const;
