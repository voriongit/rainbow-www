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

One build, two deployments: the **public demo** at rainbow.vorion.org is always
synthetic, and a **private live view** behind Cloudflare Access shows real
telemetry only. See [Private live view](#private-live-view).

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

### API

| Route | Returns |
| --- | --- |
| `GET /api/agents` | fleet roster (`synthetic` derived from provenance) |
| `GET /api/window?window=24h&agent=cascade-03` | windowed analytics + corrected risk trend |
| `GET /api/fleet?window=24h` | fleet orchestration snapshot |
| `POST /api/signals` | live view only: ingest signals (404 on the public demo) |

On the live view the read routes need an Access identity like every page, and
answer `503` with the reason while there is nothing real to show.

## Seams for upstream work

- **#3 rainbow-decontaminate** — done: the decontamination landed in
  `@vorionsys/rainbow` (0.2.x/0.3.0); the dashboard consumes the library's canonical
  `computeRiskTrend` from npm and keeps only a thin seeding/windowing adapter.
- **#5 persistent store** — done, for the private live view only:
  `SupabaseSignalRepository` + `POST /api/signals`, read through
  `LiveSignalFeed` (`app/lib/live-feed.ts`). See [Private live view](#private-live-view).
- **#6 producers/simulator** — replace `app/lib/simulator.ts` with the shared
  ecosystem simulator, keeping the `FleetSimulator` surface
  (`ensureUpTo`, `agents`, `resolveScoreAt`).

## Private live view

A second deployment of the same build, for real telemetry. `RAINBOW_DEPLOYMENT=live`
selects it; anything else (including unset or a typo) is the public demo.

| | Public demo (`rainbow.vorion.org`) | Private live view |
| --- | --- | --- |
| Data | seeded simulator, always | signals agents report, only |
| Signal store | never read, even if configured | Supabase, required |
| `POST /api/signals` | 404 | bearer token, idempotent |
| Who can see it | anyone | a verified Cloudflare Access identity |
| Modeled pages (`/lab`, `/network`, `/benchmark`, `/model`, `/control`, `/embed`) | yes | 404 |
| Indexing, link previews, offline cache, analytics | yes | none |

### Fail-closed behaviour

- Every request except `POST /api/signals` must carry a valid Access token
  (`Cf-Access-Jwt-Assertion` header or `CF_Authorization` cookie). The app
  verifies it itself against the team's signing keys, RS256 only, for this
  application's AUD, so a request that reaches the Worker without passing
  Access is refused: 401 without a token, 403 with a bad one, 503 if the keys
  cannot be fetched.
- With `CF_ACCESS_TEAM_DOMAIN` or `CF_ACCESS_AUD` missing, every page answers 503.
- With no store, an unreachable store, or no agent reported yet, pages say so and
  the API answers 503 with the reason. It never falls back to the simulator.
- The data is reloaded from the store every 15 minutes and topped up every 10 seconds
  (or right after an ingest), so every Worker isolate sees every ingest. If a
  refresh fails, the last good data stays up and the page says it may be out of date.

### Set up, in this order

1. **Access application.** In Cloudflare Zero Trust, create a self-hosted
   application for the live hostname (`rainbow-live.vorion.org` in
   `wrangler.live.jsonc`; change it if you prefer) with an Allow policy naming
   who may see it. Note its **AUD tag** and your team domain
   (`<team>.cloudflareaccess.com`).
2. **Producer access to `/api/signals`.** Producers are machines. Either add a
   second Access application for `<hostname>/api/signals` with a **Bypass**
   policy (the route still requires its bearer token), or keep it behind Access
   and give producers an Access **service token** in addition to the bearer token.
3. **Database.** Run `sql/rainbow-signals.sql` in the Supabase SQL editor. It is
   safe to re-run, and it upgrades a table created by an earlier version
   (de-duplicating rows a retry stored twice).
4. **Secrets**, each with `npx wrangler secret put NAME -c wrangler.live.jsonc`:
   `CF_ACCESS_TEAM_DOMAIN`, `CF_ACCESS_AUD`, `SUPABASE_URL`,
   `SUPABASE_SERVICE_ROLE_KEY`, `RAINBOW_INGEST_TOKEN`.
5. **Deploy:** `npm run deploy:cf:live`. The config disables the `workers.dev`
   and preview URLs, which Access would not cover.

### Producer contract

`POST /api/signals` with `Authorization: Bearer <RAINBOW_INGEST_TOKEN>` and a
JSON body of one signal or an array of up to 1000 (`app/lib/ingested-signal-schema.ts`).

- **Retries are safe.** A signal is identified by `(tenantId, signalId)`; a repeat
  is skipped, and the response reports `inserted` and `duplicates`. Retry the
  whole batch after a timeout or a 5xx.
- **Send `scoreAfter`** (your engine's score after the signal). It is
  authoritative for the roster and the start of every window. Without it a score
  is the sum of the deltas received.
- **Send `tierAfter` and `riskLevel`** on failures. The risk accumulator can only
  count a failure that has both; the dashboard says how many it could not count.
- Rejected with the offending signal and field named: `tierAfter` outside 0–7,
  a `riskLevel` that is not a BASIS level (any letter case is accepted),
  `scoreAfter` outside 0–1000, `|delta|` over 1000, unknown `busSignalType` or
  `severity`, or a timestamp more than 5 minutes in the future. A rejected batch
  stores nothing.

### Memory budget

A Worker isolate has 128 MB. The view holds the newest 50,000 signals of the
last 31 days, up to 10,000 per agent, and says on the page when history was cut
short. Tune with `RAINBOW_LIVE_MAX_SIGNALS`, `RAINBOW_LIVE_AGENT_CAPACITY` and
`RAINBOW_LIVE_REFRESH_MS`.

## Dependency note

`@vorionsys/rainbow` is consumed from npm (`^0.3.0`). It was previously vendored as a
packed tarball under `vendor/` (a `file:` dependency) while unpublished; now that the
package is published, that has been replaced with the registry version.

Score trajectories replay each signal's `delta` from the score at the window's
start. When a producer's deltas and declared `scoreAfter` disagree, the
trajectory drifts from the declared score; the package change that anchors
trajectories on `scoreAfter` closes that gap once released.

## Develop

```bash
npm install
npm run dev              # http://localhost:3000 (public demo)
npm run typecheck        # tsc --noEmit
npm run lint
npm test                 # vitest
npm run build            # production build
npm run preview:cf       # Cloudflare build, public config, local workerd
npm run preview:cf:live  # same build, live config (set the secrets in .dev.vars)
```

## Scope & limitations

- **Public demo** — 13 scripted archetypes; relative story is seeded. Never real data.
- **Private live view** — real signals only, behind Access; it never shows the
  demo, even when it has nothing to show. Ingest fails closed (503) without
  token and store.
- Delegation on `/lab` is a modeled policy over the loaded stream, not native
  A2A delegation. Dashboard correlations are derived from co-occurrence in
  that same stream (demo or live).

## License

[Apache-2.0](./LICENSE) — Copyright (c) 2026 Vorion LLC.
