// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Vorion LLC

/**
 * Which deployment this process is.
 *
 * The same build serves two deployments with opposite data policies:
 *
 *   public  rainbow.vorion.org. ALWAYS synthetic. It never reads a signal store,
 *           never accepts ingest, and holds no store credentials.
 *   live    a private deployment behind Cloudflare Access. Real telemetry only,
 *           never the simulator, and nothing is served without a verified
 *           Access identity.
 *
 * `live` is an explicit opt-in. Unset, misspelled or differently-cased values
 * all resolve to `public`, so a configuration mistake can only make a site more
 * synthetic, never expose real data.
 *
 * Pure and dependency-free so the Edge middleware can import it.
 */

export type Deployment = 'public' | 'live';

type Env = Record<string, string | undefined>;

export function resolveDeployment(env: Env = process.env): Deployment {
  return env.RAINBOW_DEPLOYMENT === 'live' ? 'live' : 'public';
}

export function isLiveDeployment(env: Env = process.env): boolean {
  return resolveDeployment(env) === 'live';
}

/**
 * Routes that only make sense over the simulator: their content is modeled or
 * illustrative (scripted control model, curated reference fleets, a delegation
 * policy applied to the stream, widgets labeled "synthetic demo"). Putting
 * them beside real telemetry would blur grounded and modeled data, so the live
 * deployment answers 404 for them.
 */
export const PUBLIC_ONLY_PREFIXES = [
  '/lab',
  '/network',
  '/benchmark',
  '/model',
  '/control',
  '/embed',
] as const;

export function isPublicOnlyPath(pathname: string): boolean {
  return PUBLIC_ONLY_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

// ----------------------------------------------------------------------------
// Cloudflare Access
// ----------------------------------------------------------------------------

export interface AccessConfig {
  /** `<team>.cloudflareaccess.com` */
  teamDomain: string;
  /** The Access application's AUD tag. */
  audience: string;
}

export type AccessConfigResult =
  | { ok: true; config: AccessConfig }
  | { ok: false; reason: string };

const TEAM_DOMAIN = /^[a-z0-9][a-z0-9-]*\.cloudflareaccess\.com$/i;

/**
 * Read the Access settings the live deployment verifies tokens against.
 *
 * The team domain is also the host the signing keys are fetched from, so it is
 * validated against the only shape Cloudflare issues rather than trusted as an
 * arbitrary URL. A pasted `https://` prefix or trailing slash is tolerated.
 */
export function resolveAccessConfig(env: Env = process.env): AccessConfigResult {
  const rawDomain = env.CF_ACCESS_TEAM_DOMAIN?.trim();
  const audience = env.CF_ACCESS_AUD?.trim();
  if (!rawDomain) return { ok: false, reason: 'CF_ACCESS_TEAM_DOMAIN is not set' };
  if (!audience) return { ok: false, reason: 'CF_ACCESS_AUD is not set' };

  const teamDomain = rawDomain.replace(/^https:\/\//i, '').replace(/\/+$/, '').toLowerCase();
  if (!TEAM_DOMAIN.test(teamDomain)) {
    return {
      ok: false,
      reason: 'CF_ACCESS_TEAM_DOMAIN must look like <team>.cloudflareaccess.com',
    };
  }
  if (/\s/.test(audience)) {
    return { ok: false, reason: 'CF_ACCESS_AUD must not contain whitespace' };
  }
  return { ok: true, config: { teamDomain, audience } };
}
