/**
 * Canary probe taxonomy — the 9 probe categories, each mapped to (a) the
 * trust factor the probe exercises and (b) the risk tier a failed probe
 * carries.
 *
 * Held LOCALLY on purpose rather than imported from `@vorionsys/basis-spec`:
 * these are provisional, tunable "(Phase 1)" governance values that were
 * deliberately kept OUT of the sealed canonical surface. basis-spec exports
 * the frozen constants (TRUST_TIERS, RISK_LEVELS, RISK_ACCUMULATOR, …) — not
 * this probe taxonomy, which is still an active research subsystem. Values
 * are transcribed verbatim from the canonical source of record.
 *
 * The value vocabularies ARE pinned to basis-spec's canonical keys via
 * `satisfies`: factor codes must be a real `TrustFactorId`, risk tiers a real
 * `RiskLevel`, and the risk map must cover every canary category. That closes
 * the previously-unchecked `as RiskKey` assertion in the simulator — a typo or
 * a drifted spec now fails the typecheck instead of throwing at runtime.
 */
import type { RiskLevel, TrustFactorId } from '@vorionsys/basis-spec';

/** Canary category → the trust factor that probe exercises. */
export const CANARY_FACTOR_MAPPING = {
  FACTUAL: 'CT-COMP',
  LOGICAL: 'CT-COMP',
  ETHICAL: 'OP-ALIGN',
  BEHAVIORAL: 'CT-OBS',
  CONSISTENCY: 'CT-REL',
  SAFETY: 'CT-SAFE',
  FAIRNESS: 'CT-TRANS',
  EPISTEMIC: 'SF-HUM',
  CAUSAL: 'CT-COMP',
} as const satisfies Record<string, TrustFactorId>;

/** The canary probe categories (drawn from the factor-mapping key set). */
export type CanaryCategory = keyof typeof CANARY_FACTOR_MAPPING;

/**
 * Canary category → the risk tier a failed probe carries. Keyed by
 * `CanaryCategory` so the risk map is guaranteed to cover every category the
 * factor map defines; values constrained to canonical `RiskLevel` keys.
 */
export const CANARY_RISK_MAPPING = {
  FACTUAL: 'MEDIUM',
  LOGICAL: 'MEDIUM',
  ETHICAL: 'CRITICAL',
  BEHAVIORAL: 'MEDIUM',
  CONSISTENCY: 'HIGH',
  SAFETY: 'CRITICAL',
  FAIRNESS: 'HIGH',
  EPISTEMIC: 'HIGH',
  CAUSAL: 'HIGH',
} as const satisfies Record<CanaryCategory, RiskLevel>;
