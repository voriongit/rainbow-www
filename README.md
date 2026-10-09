# @vorionsys/rainbow-www

**RAINBOW Trust Analytics Observatory** — live at <https://rainbow.vorion.org>.
A read-only Next.js app (Phase 5 of the package) rendering
[`@vorionsys/rainbow`](https://www.npmjs.com/package/@vorionsys/rainbow)
analytics over a simulated Trust Signal Bus stream.

RAINBOW = Recorded Analytics Involving Non-Binary Orchestration Window.
*Non-binary* means continuous trust state (a 0–1000 score, 16 factors,
trajectories), not a pass/fail bit.

Observability, not control: this surface only reads. There are no
enforcement actions and no mutation paths to trust data.

## Panels

The dashboard opens on the **fleet** (`/`); `?agent=<id>` drills into one agent.

- **Fleet score trend** — mean and median of every agent's own score over the window
- **Risk accumulators** — per-agent peak / current / direction, ranked (BASIS defines
  the accumulator per agent; there is no pooled fleet value)
- **Score trajectory** — regression trend, velocity (pts/h), acceleration, range
- **Tier distribution** — fleet histogram across trust tiers T0–T7
- **Risk accumulator** — rolling 24h pressure with warning / degraded / CB thresholds
- **Fleet view** — roster, lifecycle states, cross-agent anomaly clusters
- **State transitions** — tier promotions/demotions, circuit-breaker events, signal mix
- **Factor health** — the 16 canonical trust factors, grouped, with tier minimums

## Architecture

- **Next.js App Router, RSC-first.** All analytics reads run server-side through
  the `Rainbow` facade. View state lives in the URL — no `localStorage` /
  `sessionStorage` (the install sheet opens only from the footer's "Install app"
  control, so it has no dismissal to remember). Every route sets its own title,
  description and canonical URL.
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
- **Insights** (`app/lib/insights.ts`) are scope-bound. The library's
  `detectInsights` is a per-agent rule set; run over a pooled fleet window it
  quoted endpoints from no real series, and per agent it read an unseeded
  accumulator while the panel showed the seeded one. The app keeps the library's
  thresholds but binds each sentence to the series on the page: agent findings
  read the agent's trajectory and the same seeded accumulator the risk panel
  draws (one peak, one direction word); fleet findings cite only fleet mean,
  median and counts, and name agents individually. Accumulator findings carry
  the failures that make up the peak, shown as "contributing signals" and on
  `/proof`. `evidenceChain` stays empty (the proof plane is not wired), and the
  UI no longer promises it.
- **Report** (`/report`) is a one-fleet or one-agent brief and refuses to render
  if any insight's scope differs from the report's scope.
- **Roster ids** run `atlas-01` … `wisp-13`. `helix-13` / `wisp-14` were renumbered
  to `helix-12` / `wisp-13` with their original RNG seed (`seedKey`), so their
  behaviour is unchanged; old `/agent/*` links redirect.

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
