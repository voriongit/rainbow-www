// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Vorion LLC

/**
 * Concept registry — the backing store for the /concepts explainer hub and the
 * inline "ⓘ explain" affordances scattered across the dashboard.
 *
 * Definitional concepts (tiers, risk levels, factors, observation tiers,
 * lifecycle states) are derived DIRECTLY from the canonical `@vorionsys/basis-spec`
 * constants so they can never drift from the published standard. Metric,
 * formula, bus-signal, severity, and canary concepts are authored here (their
 * meanings are prose, not canonical data — bus-type meanings mirror the
 * contracts trust-bus doc-comments; canary values come from the local,
 * provisional `./canary-map`).
 */

import {
  TRUST_TIERS,
  RISK_LEVELS,
  OBSERVATION_TIERS,
  TRUST_FACTORS,
  LIFECYCLE_STATES,
} from '@vorionsys/basis-spec';
import { CANARY_FACTOR_MAPPING, CANARY_RISK_MAPPING } from './canary-map';

export type ConceptCategory =
  | 'tier'
  | 'risk'
  | 'factor'
  | 'observation'
  | 'lifecycle'
  | 'signal-type'
  | 'severity'
  | 'metric'
  | 'formula'
  | 'canary'
  | 'insight';

export interface Concept {
  slug: string;
  term: string;
  category: ConceptCategory;
  /** One-line summary, shown in tooltips and list views. */
  short: string;
  /** Full explanation paragraph for the concept page. */
  long: string;
  /** Optional key/value facts (thresholds, ranges, multipliers…). */
  data?: { label: string; value: string }[];
  /** Optional cross-links to related concept slugs. */
  related?: string[];
  /**
   * Optional "see it live" target — a real, existing live dashboard route for
   * this concept (tier / factor / risk / signal-type only). Derived from the
   * canonical key at registry-build time (NOT reverse-parsed from the slug),
   * so it always matches what the dynamic route expects. Concepts with no
   * dedicated live surface (metric, formula, severity, canary, observation,
   * lifecycle, insight) intentionally omit this.
   */
  live?: { href: string; label: string };
}

export const CATEGORY_LABELS: Record<ConceptCategory, string> = {
  tier: 'Trust tiers',
  risk: 'Risk levels',
  factor: 'Trust factors',
  observation: 'Observation tiers',
  lifecycle: 'Lifecycle states',
  'signal-type': 'Bus signal types',
  severity: 'Severities',
  metric: 'Metrics',
  formula: 'Formulas & thresholds',
  canary: 'Canary probes',
  insight: 'Insight types',
};

export const slugify = (s: string): string =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// ── Derived from canonical basis-spec constants ────────────────────────────

const tierConcepts: Concept[] = Object.entries(TRUST_TIERS).map(([key, spec]) => {
  const t = spec as { name: string; min: number; max: number; description: string };
  return {
    slug: `tier-${key.toLowerCase()}`,
    term: `${key} · ${t.name}`,
    category: 'tier',
    short: `Trust tier ${key} (${t.name}): scores ${t.min}–${t.max}.`,
    long: `${t.description} Tier ${key} ("${t.name}") spans composite trust scores ${t.min} to ${t.max} on the canonical 0–1000 scale. An agent's tier gates which trust factors it must satisfy and how much autonomy it is granted.`,
    data: [
      { label: 'Score range', value: `${t.min}–${t.max}` },
      { label: 'Name', value: t.name },
    ],
    related: ['metric-composite-score', 'formula-penalty-ratio'],
    // Live route: /tier/[tierKey] uppercases the segment, so pass the key as-is.
    live: { href: `/tier/${key}`, label: `tier ${key}` },
  };
});

const riskConcepts: Concept[] = Object.entries(RISK_LEVELS).map(([key, spec]) => {
  const r = spec as { multiplier: number; description: string };
  return {
    slug: `risk-${key.toLowerCase().replace(/_/g, '-')}`,
    term: key,
    category: 'risk',
    short: `Risk level ${key}: ×${r.multiplier} loss multiplier.`,
    long: `${r.description} ${key} actions carry a risk multiplier of ×${r.multiplier} in the loss formula — a failed ${key} action costs proportionally more trust, and feeds the risk accumulator weighted by this multiplier.`,
    data: [{ label: 'Multiplier', value: `×${r.multiplier}` }],
    related: ['formula-risk-accumulator', 'formula-penalty-ratio'],
    // Live route: /risk/[riskLevel] uppercases the segment and looks it up in
    // RISK_LEVELS, so pass the canonical key verbatim (preserves LIFE_CRITICAL).
    live: { href: `/risk/${key}`, label: `risk ${key}` },
  };
});

const factorConcepts: Concept[] = Object.entries(TRUST_FACTORS).map(([code, spec]) => {
  const f = spec as { name: string; group: string; weight: string; requiredFrom: string };
  return {
    slug: `factor-${code.toLowerCase()}`,
    term: `${code} · ${f.name}`,
    category: 'factor',
    short: `Trust factor ${code} (${f.name}) — ${f.group} group, required from ${f.requiredFrom}.`,
    long: `${f.name} (${code}) is one of the 16 canonical trust factors, in the ${f.group} group with ${f.weight} weight. It becomes mandatory from tier ${f.requiredFrom} upward: an agent at or above ${f.requiredFrom} must demonstrate adequate ${f.name.toLowerCase()} to retain its tier.`,
    data: [
      { label: 'Group', value: f.group },
      { label: 'Weight', value: f.weight },
      { label: 'Required from', value: f.requiredFrom },
    ],
    related: [`tier-${String(f.requiredFrom).toLowerCase()}`, 'metric-factor-health'],
    // Live route: /factor/[factorCode] matches case-insensitively; pass the
    // canonical code (with its hyphen, e.g. CT-SEC) as-is.
    live: { href: `/factor/${code}`, label: `factor ${code}` },
  };
});

const observationConcepts: Concept[] = Object.entries(OBSERVATION_TIERS).map(([key, spec]) => {
  const o = spec as { ceiling: number; maxTier: string; description: string };
  return {
    slug: `observation-${key.toLowerCase().replace(/_/g, '-')}`,
    term: key.replace(/_/g, ' '),
    category: 'observation',
    short: `Observation tier ${key}: caps trust at ${o.ceiling} (max tier ${o.maxTier}).`,
    long: `${o.description} Under ${key} observation an agent's trust is capped at a ceiling of ${o.ceiling} — it cannot exceed tier ${o.maxTier} no matter how it performs, until it is moved to a more transparent observation tier. This is the "you can't trust what you can't see" constraint.`,
    data: [
      { label: 'Score ceiling', value: String(o.ceiling) },
      { label: 'Max tier', value: o.maxTier },
    ],
    related: ['metric-observation-ceiling'],
  };
});

const lifecycleConcepts: Concept[] = Object.entries(LIFECYCLE_STATES).map(([key, spec]) => {
  const l = spec as { description: string; canOperate: boolean; canGain: boolean; canLose: boolean };
  return {
    slug: `lifecycle-${key.toLowerCase().replace(/_/g, '-')}`,
    term: key.replace(/_/g, ' '),
    category: 'lifecycle',
    short: `Lifecycle state ${key}: ${l.canOperate ? 'can operate' : 'cannot operate'}.`,
    long: `${l.description} In the ${key} state an agent ${l.canOperate ? 'may operate' : 'may NOT operate'}, ${l.canGain ? 'can gain trust' : 'cannot gain trust'}, and ${l.canLose ? 'can lose trust' : 'cannot lose trust'}.`,
    data: [
      { label: 'Can operate', value: l.canOperate ? 'yes' : 'no' },
      { label: 'Can gain', value: l.canGain ? 'yes' : 'no' },
      { label: 'Can lose', value: l.canLose ? 'yes' : 'no' },
    ],
  };
});

// ── Authored concepts (prose meanings, not canonical data) ─────────────────

const BUS_TYPE_MEANINGS: Record<string, string> = {
  threat_detected: 'An active threat was identified — a probe, tampering attempt, or injection.',
  anomaly: 'Behavioural or structural anomaly outside the agent’s expected bounds.',
  drift: 'Gradual deviation from baseline — weight drift or behavioural drift over time.',
  probe_detected: 'The agent was caught probing its execution environment (a Heisenberg trigger).',
  rotation_triggered: 'A CSSR rotation executed; a fresh execution surface is now active.',
  policy_tightened: 'The agent’s policy envelope was restricted in response to risk.',
  trust_updated: 'The agent’s trust score or tier changed (the routine score-movement signal).',
  canary_passed: 'A canary probe passed — a positive trust signal.',
  canary_failed: 'A canary probe failed — a negative trust signal.',
  dormancy_deduction: 'A dormancy milestone was reached; a stepped trust deduction was applied for inactivity.',
  risk_accumulator_warning: 'The rolling 24h risk accumulator crossed the warning threshold (≥60).',
  risk_accumulator_degraded: 'The rolling 24h risk accumulator crossed the degraded threshold (≥120).',
  circuit_breaker_tripped: 'The circuit breaker tripped — all operations halted.',
  trend_detected: 'A sustained trust trend (rising or falling) was detected.',
  fleet_anomaly: 'A fleet-wide anomaly pattern was detected across multiple agents.',
};

const signalTypeConcepts: Concept[] = Object.entries(BUS_TYPE_MEANINGS).map(([type, meaning]) => ({
  slug: `signal-${type.replace(/_/g, '-')}`,
  term: type,
  category: 'signal-type',
  short: meaning,
  long: `${meaning} This is one of the 15 canonical Trust Bus signal types every BASIS-compliant runtime can emit; analytics aggregate them by type, severity, and risk level.`,
  // Live route: /signal-type/[type] resolves the segment via
  // conceptSlug.signalType(type); the canonical underscore key resolves cleanly.
  live: { href: `/signal-type/${encodeURIComponent(type)}`, label: `signal ${type}` },
}));

const SEVERITY_MEANINGS: { key: string; meaning: string }[] = [
  { key: 'low', meaning: 'Routine operational event — informational, best-effort handling.' },
  { key: 'medium', meaning: 'Moderate concern — warrants enhanced monitoring.' },
  { key: 'high', meaning: 'Significant event — immediate attention warranted.' },
  { key: 'critical', meaning: 'Severe event — enforcement action required.' },
  { key: 'emergency', meaning: 'Immediate halt required — coordinated attack or life-safety threat.' },
];

const severityConcepts: Concept[] = SEVERITY_MEANINGS.map(({ key, meaning }) => ({
  slug: `severity-${key}`,
  term: key,
  category: 'severity',
  short: meaning,
  long: `${meaning} Severity classifies a signal’s urgency on the Trust Bus and drives routing order and the distribution breakdowns shown on the dashboard.`,
}));

const canaryConcepts: Concept[] = Object.keys(CANARY_FACTOR_MAPPING).map((category) => {
  const factor = (CANARY_FACTOR_MAPPING as Record<string, string>)[category];
  const risk = (CANARY_RISK_MAPPING as Record<string, string>)[category];
  return {
    slug: `canary-${category.toLowerCase()}`,
    term: `${category} canary`,
    category: 'canary',
    short: `Canary probe category ${category} → exercises factor ${factor}, carries ${risk} risk.`,
    long: `The ${category} canary is one of nine probe categories the runtime periodically fires to actively test an agent. A ${category} probe exercises trust factor ${factor} and a failure carries ${risk} risk. Note: the canary taxonomy is a provisional (Phase-1) governance subsystem held locally, not part of the sealed canonical spec.`,
    data: [
      { label: 'Factor exercised', value: factor },
      { label: 'Risk on failure', value: risk },
    ],
    related: [`factor-${factor.toLowerCase()}`, `risk-${risk.toLowerCase().replace(/_/g, '-')}`],
  };
});

const metricConcepts: Concept[] = [
  {
    slug: 'elbow',
    term: 'Elbow',
    category: 'metric',
    short:
      'The observed inflection inside a window where a continuous trust/risk curve bends into a discrete state change.',
    long: 'RAINBOW keeps trust continuous (non-binary) for as long as possible — the Elbow is the moment the spectrum must collapse to a binary state. It is the observed inflection inside an observation window where a continuous trust or risk curve bends into a discrete state change: the rolling risk accumulator crossing Degraded → Breaker, or a circuit-breaker trip freezing gains so the score trajectory flatlines. The window stays non-binary; the Elbow is the bend within it. Note: distinct from the statistical "elbow" (a diminishing-returns bend) — here it names the visible bend a governance state change puts in the curve. Honesty boundary: RAINBOW observes the Elbow; the binary governance action is taken elsewhere (the control plane), never by this read-only observatory.',
    data: [
      { label: 'Where', value: 'Inside the observation window' },
      { label: 'Marks', value: 'Continuous → discrete state change' },
      { label: 'Example', value: 'Degraded → Breaker crossing' },
    ],
    related: ['metric-risk-accumulator', 'formula-risk-accumulator', 'metric-trajectory'],
  },
  {
    slug: 'metric-composite-score',
    term: 'Composite trust score',
    category: 'metric',
    short: 'An agent’s overall trust on the 0–1000 scale; determines its tier.',
    long: 'The composite trust score is the single 0–1000 number summarising how much an agent is trusted right now. It moves by the gain and loss formulas as signals arrive and maps to a trust tier (T0–T7) via the tier boundaries.',
    related: ['formula-gain', 'formula-penalty-ratio'],
  },
  {
    slug: 'metric-trajectory',
    term: 'Score trajectory',
    category: 'metric',
    short: 'The agent’s score over the selected window, with trend, velocity and acceleration.',
    long: 'The trajectory replays the agent’s composite score across the window. Trend classifies the overall direction (rising/falling/stable); velocity is the rate of change in points per hour; acceleration is the change of velocity (pts/h²). A least-squares regression overlay shows the underlying direction through the noise.',
    related: ['metric-velocity', 'metric-acceleration'],
  },
  {
    slug: 'metric-velocity',
    term: 'Velocity',
    category: 'metric',
    short: 'Rate of trust-score change, in points per hour.',
    long: 'Velocity is the first derivative of the score trajectory — how many points of trust the agent is gaining or losing per hour over the window. Sustained negative velocity is an early warning even before the absolute score looks alarming.',
  },
  {
    slug: 'metric-acceleration',
    term: 'Acceleration',
    category: 'metric',
    short: 'Rate of change of velocity, in points per hour².',
    long: 'Acceleration is the second derivative of the trajectory. Positive acceleration means a decline is slowing (or a rise is steepening); negative means a slide is getting worse. It catches inflection points the raw score hides.',
  },
  {
    slug: 'metric-factor-health',
    term: 'Factor health',
    category: 'metric',
    short: 'Per-factor success rate (0–100%) across the 16 trust factors, with evidence counts.',
    long: 'Factor health buckets the agent’s signals by trust factor and reports the success rate for each, plus how many pieces of evidence backed it and whether it meets the minimum its tier requires. Low evidence is shown honestly as "no data" rather than assumed healthy — absence of evidence is not evidence of health.',
    related: ['metric-evidence-count'],
  },
  {
    slug: 'metric-evidence-count',
    term: 'Evidence count',
    category: 'metric',
    short: 'How many recent signals backed a factor’s health reading.',
    long: 'Each factor health reading is only as trustworthy as the evidence behind it. The evidence count is the number of recent signals exercising that factor; a health percentage backed by "0 ev" is not asserted as healthy.',
  },
  {
    slug: 'metric-observation-ceiling',
    term: 'Observation ceiling',
    category: 'metric',
    short: 'The maximum trust score an agent can reach given how observable it is.',
    long: 'An agent’s observation tier imposes a ceiling: a black-box agent cannot be trusted as highly as a fully transparent one, regardless of behaviour. The "what-if" shows how the ceiling — and the reachable tier — would rise if the agent were moved to a more transparent observation tier.',
    related: ['observation-black-box'],
  },
  {
    slug: 'metric-risk-accumulator',
    term: 'Risk accumulator',
    category: 'metric',
    short: 'A rolling 24h sum of P(T)×R failure pressure, with warning/degraded/breaker thresholds.',
    long: 'The risk accumulator sums the canonical P(T)×R contribution of each failure over a rolling 24-hour window. Crossing the warning (60), degraded (120) or circuit-breaker (240) thresholds escalates the agent. This dashboard computes the corrected P(T)×R accumulation rather than an R-only proxy.',
    related: ['formula-risk-accumulator', 'formula-penalty-ratio'],
  },
  {
    slug: 'metric-anomaly-cluster',
    term: 'Anomaly cluster',
    category: 'metric',
    short: 'A group of agents flagged together for sharing failing factors.',
    long: 'When multiple agents fail on the same trust factors in a correlated way, they are grouped into an anomaly cluster — a signal of a coordinated or common-cause problem (e.g. several agents sharing CT-SEC/CT-ID failures). The cluster names its members and the factors they share.',
  },
];

const formulaConcepts: Concept[] = [
  {
    slug: 'formula-gain',
    term: 'Gain formula',
    category: 'formula',
    short: 'gain = GAIN_RATE · ln(1 + headroom) · ∛(risk multiplier).',
    long: 'Trust is earned sub-linearly: a successful action adds gain = GAIN_RATE · ln(1 + (ceiling − score)) · cube-root(R). Headroom shrinks as the score approaches its ceiling (the last points are hardest), and higher-risk successes are worth more via the cube-root of the risk multiplier.',
    related: ['metric-composite-score', 'metric-observation-ceiling'],
  },
  {
    slug: 'formula-penalty-ratio',
    term: 'P(T) — penalty ratio / loss',
    category: 'formula',
    short: 'P(T) = PENALTY_RATIO_MIN + (T/7)·(MAX−MIN); loss = −P(T)·R·…',
    long: 'Trust is lost faster the more trusted you are: the penalty ratio P(T) rises with tier T from PENALTY_RATIO_MIN (3) at T0 to PENALTY_RATIO_MAX (10) at T7. A failure costs −P(T) · R · GAIN_RATE · ln(1 + ceiling/2), so a high-tier agent failing a high-risk action is punished hardest. This same P(T)×R is the per-failure contribution to the risk accumulator.',
    related: ['metric-risk-accumulator', 'metric-composite-score'],
  },
  {
    slug: 'formula-risk-accumulator',
    term: 'Risk accumulator thresholds',
    category: 'formula',
    short: 'Rolling 24h Σ P(T)×R, thresholds 60 (warning) / 120 (degraded) / 240 (breaker).',
    long: 'Each failing, non-blocked signal contributes P(T)×R to a 24-hour rolling sum. The accumulator crossing 60 raises a warning, 120 marks the agent degraded, and 240 trips the circuit breaker. Blocked signals and failures without a usable tier/risk are excluded — never estimated.',
    related: ['formula-penalty-ratio', 'metric-risk-accumulator'],
  },
  {
    slug: 'formula-circuit-breaker',
    term: 'Circuit breaker',
    category: 'formula',
    short: 'Halts an agent’s operations when failure pressure crosses the breaker threshold.',
    long: 'The circuit breaker is the hard stop: when an agent’s risk accumulator crosses the breaker threshold it trips, halting all operations until the agent requalifies. Trips, degraded entries, and resets are tracked as state transitions.',
    related: ['formula-risk-accumulator', 'lifecycle-tripped'],
  },
];

const INSIGHT_MEANINGS: { cat: string; meaning: string }[] = [
  { cat: 'TREND_DETECTED', meaning: 'A sustained directional trust trend (rising or falling) was detected over the window — not just noise.' },
  { cat: 'FLEET_ANOMALY', meaning: 'A fleet-wide anomaly pattern: multiple agents deviating together in a correlated way.' },
  { cat: 'DELEGATION_RISK', meaning: 'A risky delegation pattern — e.g. requestor→handler pairs concentrating or colluding beyond a safe share.' },
  { cat: 'DORMANCY_WARNING', meaning: 'Inactivity is accruing stepped dormancy deductions; the agent may be idle or under-utilized.' },
  { cat: 'PROMOTION_CANDIDATE', meaning: 'The agent has sustained healthy signals and may be eligible for promotion to a higher trust tier.' },
  { cat: 'FACTOR_DEGRADATION', meaning: 'One or more trust factors are degrading — the agent is weakening on a specific competency.' },
  { cat: 'CB_PATTERN', meaning: 'A circuit-breaker pattern — trips, degraded entries, and/or repeated recovery cycles worth attention.' },
  { cat: 'ACCUMULATOR_ESCALATION', meaning: 'The rolling risk accumulator is escalating toward (or past) its warning/degraded/breaker thresholds.' },
];

const insightConcepts: Concept[] = INSIGHT_MEANINGS.map(({ cat, meaning }) => ({
  slug: `insight-${cat.toLowerCase().replace(/_/g, '-')}`,
  term: cat.replace(/_/g, ' '),
  category: 'insight',
  short: meaning,
  long: `${meaning} RAINBOW's insight engine derives this rule-based finding from the window analytics (trajectory, transitions, distribution, risk accumulator); each insight names the agents involved and, where available, an evidence chain of supporting events.`,
}));

export const CONCEPTS: Concept[] = [
  ...tierConcepts,
  ...riskConcepts,
  ...factorConcepts,
  ...observationConcepts,
  ...lifecycleConcepts,
  ...signalTypeConcepts,
  ...severityConcepts,
  ...canaryConcepts,
  ...metricConcepts,
  ...formulaConcepts,
  ...insightConcepts,
];

const BY_SLUG = new Map(CONCEPTS.map((c) => [c.slug, c]));

export function getConcept(slug: string): Concept | undefined {
  return BY_SLUG.get(slug);
}

export function conceptsByCategory(category: ConceptCategory): Concept[] {
  return CONCEPTS.filter((c) => c.category === category);
}

/** Concept slug helpers for linking from dashboard elements. */
export const conceptSlug = {
  tier: (key: string) => `tier-${key.toLowerCase()}`,
  risk: (level: string) => `risk-${level.toLowerCase().replace(/_/g, '-')}`,
  factor: (code: string) => `factor-${code.toLowerCase()}`,
  observation: (key: string) => `observation-${key.toLowerCase().replace(/_/g, '-')}`,
  lifecycle: (state: string) => `lifecycle-${state.toLowerCase().replace(/_/g, '-')}`,
  signalType: (type: string) => `signal-${type.toLowerCase().replace(/_/g, '-')}`,
  severity: (sev: string) => `severity-${sev.toLowerCase()}`,
  insight: (cat: string) => `insight-${cat.toLowerCase().replace(/_/g, '-')}`,
};
