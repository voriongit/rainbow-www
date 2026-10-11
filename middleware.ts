// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Vorion LLC

/**
 * Applies the live-deployment gate (app/lib/live-gate.ts) to every request.
 *
 * This is `middleware.ts`, not Next 16's `proxy.ts`, on purpose: `proxy` always
 * runs on the Node.js runtime, and OpenNext's Cloudflare build refuses Node
 * middleware outright. Edge middleware is the only form that deploys here.
 *
 * On the public deployment the gate passes everything through untouched.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { decideAccess } from './app/lib/live-gate';

export async function middleware(request: NextRequest) {
  const decision = await decideAccess({
    pathname: request.nextUrl.pathname,
    headers: request.headers,
  });

  if (decision.action === 'deny') {
    const init = { status: decision.status, headers: { 'cache-control': 'no-store' } };
    return request.nextUrl.pathname.startsWith('/api/')
      ? NextResponse.json({ error: decision.message }, init)
      : new NextResponse(decision.message, {
          ...init,
          headers: { ...init.headers, 'content-type': 'text/plain; charset=utf-8' },
        });
  }

  const response = NextResponse.next();
  for (const [name, value] of Object.entries(decision.headers)) {
    response.headers.set(name, value);
  }
  return response;
}

export const config = {
  // Everything except build assets and static icons, which carry no data.
  matcher: ['/((?!_next/static|_next/image|favicon.svg|icons/|manifest.webmanifest).*)'],
};
