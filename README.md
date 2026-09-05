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
- **Risk accumulator** (`app/lib/corrected-risk-trend.ts`): a thin display adapter
  over the library's canonical **P(T) × R** `computeRiskTrend` (`@vorionsys/rainbow`),
  adding pre-window seeding so the rolling 24h metric is window-correct.
- **Charts** are server-rendered SVG — zero chart-library JS on the client.

### Read-only API

| Route | Returns |
| --- | --- |
| `GET /api/agents` | fleet roster (`synthetic` derived from provenance) |
| `GET /api/window?window=24h&agent=cascade-03` | windowed analytics + corrected risk trend |
| `GET /api/fleet?window=24h` | fleet orchestration snapshot |

## Seams for upstream work

- **#3 rainbow-decontaminate** — done: the decontamination landed in
  `@vorionsys/rainbow` (0.2.x/0.3.0); the dashboard consumes the library's canonical
  `computeRiskTrend` from npm and keeps only a thin seeding/windowing adapter.
- **#5 persistent store** — done: `SupabaseWindowStore` + `POST /api/signals`.
  Hydrate loads the mirror; live mode **replays** those rows into a fresh
  Rainbow so the collector (risk, signal log, correlations) sees the same
  signals as window analytics. Env: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
  (server-only), `RAINBOW_INGEST_TOKEN`. Apply `sql/rainbow-signals.sql` first.
- **#6 producers/simulator** — replace `app/lib/simulator.ts` with the shared
  ecosystem simulator, keeping the `FleetSimulator` surface
  (`ensureUpTo`, `agents`, `resolveScoreAt`).

## Dependency note

`@vorionsys/rainbow` is consumed from npm (`^0.3.0`). It was previously vendored as a
packed tarball under `vendor/` (a `file:` dependency) while unpublished; now that the
package is published, that has been replaced with the registry version.

## Develop

```bash
npm install
npm run dev         # http://localhost:3000
npm run typecheck   # tsc --noEmit
npm run build       # production build
```

## Scope & limitations

- **Demo fleet** (default) — 13 scripted archetypes; relative story is seeded.
- **Live** — store configured and non-empty. Reads fail open to the demo if
  hydrate fails; ingest fails closed (503) without token+store.
- Delegation on `/lab` is a modeled policy over the loaded stream, not native
  A2A delegation. Dashboard correlations are derived from co-occurrence in
  that same stream (demo or live).

## License

[Apache-2.0](./LICENSE) — Copyright (c) 2026 Vorion LLC.
