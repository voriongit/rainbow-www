# FEATURE PLAN (RE-BASED) — rainbow.vorion.org
**Date:** June 18, 2026 · **Supersedes:** `FP_md_061826.md`
**Product:** RAINBOW Trust Analytics Observatory
**Why re-based:** the original FP's "Current State / Missing" was written against a much older snapshot. Verified against the live repo (`D:\voriongit\rainbow-www`) + the Phase 0 immersive work shipped 2026‑06‑18, several "missing" items already exist or are done. This version corrects that, marks redundant items, folds in the **Elbow**, and merges the FP into the approved **cockpit roadmap** so there's one phase model, not two.

---

## 0. How this fits the bigger picture (lanes + roadmap)

Two Vorion surfaces, two lanes (ratified):
- **Mission Control (`demo.vorion.org`)** = the *field* — per‑action HITL governance + scenarios + GTM. **Other lane.** This FP does **not** touch it (cross‑link only).
- **RAINBOW (`rainbow.vorion.org`)** = the *tower* — **observe + (later) control**. This FP is the **observe/brand sub‑layer** of the tower; it **merges into** the approved cockpit plan (`C:\Users\racas\.claude\plans\how-do-we-make-ancient-mist.md`), it does not run parallel to it.

**Binding guardrails (unchanged, apply to every feature here):**
- Read‑only / synthetic / deterministic public DEMO. Any "interactive" control affects only the local sim view, clearly labeled. Real operator control is the cockpit track (separate auth origin, later phases).
- Shared **claim gate** (`CLAIM-VOCABULARY.md` / Sentinel): "audit infrastructure / trust telemetry / observability" — never "governs" as a capability; CogniGate "advisory v0.x"; enforcement "direction of travel"; keep the WHITE_BOX ceiling.
- Preserve deep links / URL state and the synthetic disclaimer.
- Public asset stability: ship on a branch → Vercel **preview** → device test → PR → merge. Never break the live launch asset (Mission Control's GTM depends on it).

---

## 1. Corrected Current State

**Working (verified in repo):**
- Deterministic 13‑agent fleet simulator: T0–T7 tiering, 0–1000 trust scoring, risk accumulator w/ thresholds, anomaly clusters, derived delegation health + collusion, cross‑agent correlations, 16 BASIS factors.
- **Interactive SVG charts already exist** — `line-chart.tsx`, `bar-chart.tsx`, `sparkline.tsx` (trajectory, risk‑accumulator w/ threshold lines, tier distribution + histogram). *As of Phase 0 they are touch‑scrubbable.*
- **Tier color mapping already exists** — `lib/tiers.ts → TIER_COLORS` (used in 8 places: tier badges, distribution panel, roster, agent/tier pages, status‑colors).
- Full **explorability**: drill‑down routes `/agent /factor /tier /risk /signal-type /cluster /concepts(+slug)`; `/compare` (side‑by‑side) and `/lab` (derived delegation/collusion) are **functional, not skeletons**.
- Synthetic disclaimer + scope/limitations; URL‑driven state; ⌘K command palette.
- **Phase 0 immersive layer (shipped 6/18, branch `feat/immersive-mobile-cockpit-phase0`):** touch charts, tap tooltips, mobile bottom tab bar, installable+offline **PWA**, freshness/offline honesty badge, **View‑Transition** route cross‑fades, per‑request `cache()` perf dedupe, viewport/safe‑area.

**Genuinely missing (the real opportunity):**
- ❗ **No hero "Rainbow Tier Spectrum" element** — `TIER_COLORS` exists but there is no prominent spectrum visualizer making the 8‑tier model instantly legible. *This is the #1 net‑new branding win.*
- No **conversion CTAs** / ecosystem bridge (vorion.org, npm, Mission Control); experience dead‑ends.
- No **Elbow** concept — the binary inflection point inside the window is unnamed/unmarked.
- Some **factor‑health "— no data —"** gaps (a few maturity factors).
- `/lab` is derived but not yet a **what‑if playground**; insights are not yet **clickable drill‑downs**; `/concepts` not yet bidirectionally tied to live examples; factor health is a list, not an explorer.
- Header brand presence is thin (no spectrum accent / logo link).

**At risk:** branding mismatch (vivid name, restrained visuals) — the spectrum visualizer is the highest‑leverage fix. (Bounce/mobile/chart risks from the original FP are largely retired by Phase 0.)

---

## 2. Already shipped — original‑FP items now DONE (don't rebuild)

| Original FP item | Status |
|---|---|
| P1‑F2 Real charts (trajectory/risk) | ✅ exist (interactive SVG) + now touch‑scrubbable |
| P1‑F3 Mobile‑first overhaul | ✅ Phase 0 (bottom nav, PWA, touch, safe‑area) |
| P1‑F5 ⌘K hint / live timestamp | ✅ palette + visible Search trigger + freshness badge |
| P2‑F1 `/compare` functional | ◑ exists (side‑by‑side); polish + spectrum‑diff remain |
| P2‑F2 `/lab` delegation | ◑ derived delegation/collusion exists; *playground* remains |
| P2‑F6 glossary | ◑ `/concepts(+slug)` + InfoLink popovers exist; *live‑example linking* remains |
| Shared color tokens | ◑ `TIER_COLORS` + `status-colors.ts` exist; extend to a perceptual spectrum scale |

---

## 3. Unified roadmap (observe/brand track + control track in one model)

- **Phase 0 — Immersive foundation — ✅ DONE** (touch / PWA / motion / perf). *Pre‑existing charts + tier colors fold in here.*
- **Phase 1 — Rainbow brand activation — NEXT** (this doc, §4). Net‑new only.
- **Phase 2 — Observability depth** (§5).
- **Phase 3 — Observe moat** (§6).
- **Control track (cockpit plan, interleaves after P1):** honesty + taxonomy spine (read‑only viz) → DEMO cockpit interactions → LIVE control on **separate auth origin** → (hard‑stop) kernel posture. *This is the "tower → control" half; it rides on the brand layer but stays in its own phased, safety‑gated track.*

---

## 4. Phase 1 — Rainbow brand activation (net‑new, this week)

### F1 · Interactive Rainbow Trust Tier Spectrum Visualizer  ⟵ the hero
Prominent spectrum (gradient bar / segmented arc) mapping T0→T7 with the **existing `TIER_COLORS`** (extend to a perceptually even, WCAG‑safe scale as a design token). Overlay live fleet distribution as markers/counts; click/hover a tier → filter the roster + highlight matching tiers elsewhere. Mobile: responsive stacked legend + compact bar. Subtle highlight motion (reduced‑motion safe; **not** decorative particles — consistent with Rejected #5).
*Builds on:* `TIER_COLORS`, fleet distribution, existing filter/URL patterns. *Must not regress:* data accuracy, disclaimer, URL state.

### F2 · Define & visualize the **Elbow**  (folds into F1 + the risk chart)
Name + mark the binary inflection inside the (non‑binary) window. **Sharpened for rainbow's lane + brand** (see §7 for the exact glossary + annotation). Annotate the risk/trajectory chart where a state change bends the curve; one `/concepts` entry; reference once in Insights. Zero new deps — rides on the existing charts + color system.

### F3 · Conversion & onboarding CTAs + reciprocal cross‑link
Non‑intrusive CTAs: "See the full Vorion stack → vorion.org", "Open‑source on npm", and the **reciprocal lane cross‑link "See governed work in context → demo.vorion.org"** (Mission Control adds the inverse). A "How to read this demo" expandable. **All copy through the claim gate** (no "governs"; advisory v0.x; direction of travel). *Must not regress:* read‑only contract, serious tone.

### F4 · Header & brand accent elevation
Vorion logo + link, crisp "Synthetic Demo" badge, spectrum accent (subtle gradient underline previewing F1's palette). Lightweight; no personality transplant (Rejected #3).

### F5 · Factor‑health "no‑data" pass
Fill or honestly label the "— no data —" maturity factors so the dashboard reads complete (small data/labeling pass).

*(Dropped from original P1: charts + mobile = already done.)*

---

## 5. Phase 2 — Observability depth (this sprint)

1. **`/compare` polish** — overlaid trajectory charts + factor diff highlighting using spectrum colors (view exists; deepen).
2. **Interactive `/lab` what‑if playground** — preset/policy knobs (strict/balanced/custom risk tolerance) re‑computing collusion %/escalation **client‑side over the seeded sim**, clearly "simulated, local‑only." *(This is the observe‑side sibling of the cockpit's control surfaces — keep it explicitly modeling, not controlling.)*
3. **Clickable insights → drill‑down** — every insight opens factor‑level root cause in spectrum colors; "Elbow crossed at HH:MM" language on state changes.
4. **Factor Health Explorer** — list → interactive matrix/heatmap (radar optional, perf‑aware on mobile); click a factor → filter dashboard.
5. **One‑click shareable report snapshot** — print‑optimized / canvas‑to‑image, branded, **labeled synthetic**.
6. **Glossary live examples** — `/concepts` terms link bidirectionally to live filtered dashboard views.

---

## 6. Phase 3 — Observe moat (this quarter)

1. **Embeddable Rainbow widgets/badges** (spectrum mini, fleet badge, agent card) — componentize F1/charts; zero‑dep snippets.
2. **Scenario playground / what‑if fork** — duplicate sim state, inject anomalies, replay; "Playground mode," modeling‑not‑control.
3. **Cross‑fleet benchmarking** — vs 2–3 curated reference fleets; spectrum diff overlays.
4. **Proof‑chain & signal‑propagation visualizer** — timeline/graph of signal→canary→breaker propagation; **keep claims honest** (tamper‑evident not tamper‑proof; simulated anchoring labeled). *Strong synergy with the cockpit's per‑effect provenance honesty model.*
5. **A11y (WCAG 2.2) + performance hardening** — runs continuously, milestone here; reduced‑motion already wired in Phase 0.

---

## 7. The Elbow — exact spec (lane‑ & brand‑sharpened)

**Glossary entry (`/concepts`):**
> **Elbow** — the *observed* inflection inside an observation window where a continuous trust/risk curve **bends into a discrete state change** — e.g. the risk accumulator crossing Degraded→Breaker, or a circuit‑breaker trip freezing gains so the score trajectory flatlines. RAINBOW keeps trust **continuous (non‑binary) for as long as possible; the Elbow is the moment the spectrum must collapse to a binary state.** The window stays non‑binary; the Elbow is the bend within it.
> *Note:* distinct from the statistical "elbow" (diminishing‑returns bend) — here it names the visible bend a governance state change puts in the curve.
> *Honesty/lane:* RAINBOW **observes** the Elbow; the binary governance **action** is taken elsewhere (Mission Control / the control plane), never by this read‑only observatory.
> *Related:* Observation Window, Risk Accumulator, Circuit Breaker, Lifecycle States, Trust Tier.

**Chart annotation (risk/trajectory):**
- Marker at the Elbow in the **severity color of the line it crossed**; label "Elbow — entered Breaker at HH:MM UTC"; hover/tap subtext explains the bend. Visible only when an Elbow exists in the current window; subtle when the window is clean. Touch‑legible (reuses Phase 0 chart scrub). Referenced in Insights drill‑down (P2‑F3).

**Must not regress:** the time‑window selector language, the "Non‑Binary Orchestration Window" framing, numeric readouts, or the read‑only/synthetic contract.

---

## 8. Dependency map (corrected)

- **Palette & chart primitive already exist** (`TIER_COLORS`, SVG charts) — the original "flag for early decision" is **resolved**: no charting library needed; extend tokens + reuse `line/bar-chart`.
- P1‑F1 spectrum → builds on `TIER_COLORS`; everything in P1 can proceed in parallel.
- P2 builds on P1 spectrum/color language + existing per‑agent/policy data.
- P3 embeds depend on P1 components being extracted; proof‑chain viz depends on existing proof fields.
- Control track (cockpit) interleaves after P1 and is independently phase‑gated (its own plan).
- No backend/data‑model changes for P1–P2.

---

## 9. Parking lot / rejected (carried over — consistent with lanes)

**Parking:** live (non‑sim) telemetry; user‑uploaded log analysis; collaboration layer; in‑demo ML forward prediction; i18n; AR/VR.
**Rejected (rationale holds):** live connectivity on the public demo (violates read‑only + belongs in AgentAnchor); gamification (undercuts enterprise tone); consumer/marketing redesign (regresses credible technical tone); predictive AI in P1/P2 (legibility first); heavy animation/particles (noise/perf/a11y). *All consistent with the cockpit plan's conservatism.*

---

## 10. Recommended first increment

**P1‑F1 Tier Spectrum Visualizer + P1‑F2 Elbow**, on the existing `feat/immersive-mobile-cockpit-phase0` branch (so it lands with Phase 0 for one device test). Highest brand leverage, low risk, reuses `TIER_COLORS` + chart primitives, and the two reinforce each other (continuous spectrum ↔ the bend to binary). Then F3 CTAs/cross‑link, F4 header, F5 no‑data pass.

**Handoff:** execute one feature at a time; verify no regression vs live; ship branch→preview→PR; pause for sign‑off between features.
