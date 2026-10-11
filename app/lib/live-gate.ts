// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Vorion LLC

/**
 * Request gate for the live deployment: the decision, separated from Next so it
 * is testable without a runtime. `middleware.ts` applies it to every request.
 *
 * public deployment   pass everything through untouched.
 * live deployment     fail closed:
 *   - modeled/illustrative routes are 404 (see PUBLIC_ONLY_PREFIXES);
 *   - POST /api/signals passes to its own bearer-token check, because
 *     producers are machines, not people behind Access;
 *   - everything else needs a valid Cloudflare Access token, and the whole
 *     deployment refuses to serve while the Access settings are missing or
 *     malformed.
 */

import { getAccessVerifier, readAccessToken, type AccessVerifier } from './access-jwt';
import {
  isLiveDeployment,
  isPublicOnlyPath,
  resolveAccessConfig,
  type AccessConfig,
} from './deployment';

export const INGEST_PATH = '/api/signals';

/**
 * Real telemetry must not be cached by a shared cache, indexed, or leak its
 * URLs (which carry agent ids) through the Referer header.
 */
export const LIVE_RESPONSE_HEADERS: Readonly<Record<string, string>> = {
  'cache-control': 'private, no-store',
  'x-robots-tag': 'noindex, nofollow, noarchive',
  'referrer-policy': 'no-referrer',
  'x-content-type-options': 'nosniff',
};

export type GateDecision =
  | { action: 'pass'; headers: Readonly<Record<string, string>> }
  | { action: 'deny'; status: 401 | 403 | 404 | 503; message: string };

export interface GateInput {
  pathname: string;
  headers: Headers;
}

export interface GateDeps {
  env?: Record<string, string | undefined>;
  /** Test seam: replaces the remote-key verifier. */
  verifierFor?: (config: AccessConfig) => AccessVerifier;
}

const PASS_UNTOUCHED: GateDecision = { action: 'pass', headers: {} };

export async function decideAccess(input: GateInput, deps: GateDeps = {}): Promise<GateDecision> {
  const env = deps.env ?? process.env;
  if (!isLiveDeployment(env)) return PASS_UNTOUCHED;

  if (isPublicOnlyPath(input.pathname)) {
    return { action: 'deny', status: 404, message: 'Not found' };
  }

  if (input.pathname === INGEST_PATH) {
    return { action: 'pass', headers: LIVE_RESPONSE_HEADERS };
  }

  const access = resolveAccessConfig(env);
  if (!access.ok) {
    console.error('[rainbow] live deployment is misconfigured:', access.reason);
    return {
      action: 'deny',
      status: 503,
      message: `Live deployment is not configured: ${access.reason}`,
    };
  }

  const verify = (deps.verifierFor ?? getAccessVerifier)(access.config);
  const verdict = await verify(readAccessToken(input.headers));
  if (verdict.ok) return { action: 'pass', headers: LIVE_RESPONSE_HEADERS };

  switch (verdict.reason) {
    case 'missing':
      return { action: 'deny', status: 401, message: 'Authentication required' };
    case 'invalid':
      return { action: 'deny', status: 403, message: 'Forbidden' };
    case 'unavailable':
      return { action: 'deny', status: 503, message: 'Access could not be verified right now' };
  }
}
