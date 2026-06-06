# @vorionsys/rainbow-www

**RAINBOW Trust Analytics Observatory** — a read-only Next.js dashboard
rendering [`@vorionsys/rainbow`](https://github.com/voriongit/rainbow)
analytics over a simulated Trust Signal Bus stream.

Observability, not control: this surface only reads. There are no
enforcement actions and no mutation paths to trust data.

## Panels

- **Score trajectory** — regression trend, velocity (pts/h), acceleration, range
- **Tier distribution** — fleet histogram across trust tiers T0–T7
- **Risk accumulator** — rolling 24h pressure with warning / degraded / CB thresholds
- **Fleet view** — roster, lifecycle states, cross-agent anomaly clusters
- **State transitions** — tier promotions/demotions, circuit-breaker events, signal mix
- **Factor health** — the 16 canonical trust factors, grouped, with tier minimums

## Architecture

- **Next.js App Router, RSC-first.** All analytics reads run server-side through
  the `Rainbow` facade. The only client components are the time-window and agent
  selectors; view state lives in the URL — no `localStorage`/`sessionStorage`.
- **Demo data source** (`app/lib/simulator.ts`): a deterministic, seeded fleet
  simulator producing `IngestedSignal`s for 13 agents over 30 days of history,
  extended lazily to "now" on each request. Score dynamics follow the canonical
  BASIS formulas (`gain = gainRate × ln(1 + C − S) × ∛R`,
  `loss = −P(T) × R × gainRate × ln(1 + C/2)`). Archetypes (steady, rising,
  degrading, erratic, CB-trip-and-recover, dormant, compromised cluster) are
  scripted to exercise every analytics surface.
- **Corrected risk accumulator** (`app/lib/corrected-risk-trend.ts`): replays the
  rolling 24h accumulator with the canonical per-failure contribution
  **P(T) × R** instead of the R-only proxy in `@vorionsys/rainbow@0.1.0`.
  Delete once the decontamination pass lands in the library.
- **Charts** are server-rendered SVG — zero chart-library JS on the client.

### Read-only API

| Route | Returns |
| --- | --- |
| `GET /api/agents` | simulated fleet roster |
| `GET /api/window?window=24h&agent=cascade-03` | windowed analytics + corrected risk trend |
| `GET /api/fleet?window=24h` | fleet orchestration snapshot |

## Seams for upstream work

- **#3 rainbow-decontaminate** — swap `corrected-risk-trend.ts` for the library's
  corrected `computeRiskTrend`.
- **#5 persistent store** — construct `Rainbow` with a Supabase-backed
  `WindowStore` in `app/lib/data-source.ts`; the accessors only depend on the
  facade surface. Keys stay in env (`SUPABASE_URL`, anon key + RLS); the
  service-role key must never reach the client.
- **#6 producers/simulator** — replace `app/lib/simulator.ts` with the shared
  ecosystem simulator, keeping the `FleetSimulator` surface
  (`ensureUpTo`, `agents`, `resolveScoreAt`).

## Dependency note

`@vorionsys/rainbow` is not yet published to npm; it is vendored as a packed
tarball under `vendor/` and installed via a `file:` dependency. When the
package publishes, replace the `file:` spec with the registry version.

## Develop

```bash
npm install
npm run dev         # http://localhost:3000
npm run typecheck   # tsc --noEmit
npm run build       # production build
```

## Scope & limitations

- All data is synthetic — a deterministic simulator, not live agents. Absolute
  timestamps are anchored to each server process start; the relative story is
  seeded and reproducible.
- Each serverless instance holds its own in-memory stream; different instances
  may render slightly different absolute phases. A persistent store (#5)
  removes this caveat.
- Delegation health and cross-agent correlation feeds are not wired (no
  upstream DelegationService / CrossAgentCorrelator in the demo).

## License

[Apache-2.0](./LICENSE) — Copyright (c) 2026 Vorion LLC.
