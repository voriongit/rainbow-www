// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Vorion LLC

/*
 * Hand-rolled service worker (Turbopack-safe — no build-plugin dependency).
 * Runtime caching only, so it needs no injected build manifest:
 *   - navigations  → NetworkFirst (fresh online; last-seen page or /offline when down)
 *   - build assets → CacheFirst   (content-hashed → immutable)
 *   - read APIs    → StaleWhileRevalidate (instant last-seen, refresh in background)
 *   - control/auth/write endpoints → network-only, never cached (cockpit-safety:
 *     a control action must never be served from cache or replayed)
 * Registered in production only (see components/pwa/sw-register.tsx).
 */

const VERSION = 'rainbow-v1';
const STATIC_CACHE = `${VERSION}-static`;
const PAGE_CACHE = `${VERSION}-pages`;
const API_CACHE = `${VERSION}-api`;
const OFFLINE_URL = '/offline';

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(PAGE_CACHE);
      try {
        await cache.add(OFFLINE_URL);
      } catch {
        /* offline page will be fetched lazily if precache fails */
      }
      await self.skipWaiting();
    })()
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k)));
      await self.clients.claim();
    })()
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Control / approvals / auth are network-only — never cache or replay a write.
  if (
    url.pathname.startsWith('/api/control') ||
    url.pathname.startsWith('/api/approvals') ||
    url.pathname.startsWith('/api/auth')
  ) {
    return;
  }

  if (req.mode === 'navigate') {
    event.respondWith(networkFirstNavigation(req));
    return;
  }

  if (
    url.pathname.startsWith('/_next/static') ||
    url.pathname.startsWith('/icons/') ||
    url.pathname === '/favicon.svg' ||
    url.pathname === '/manifest.webmanifest'
  ) {
    event.respondWith(cacheFirst(req, STATIC_CACHE));
    return;
  }

  if (url.pathname.startsWith('/api/')) {
    event.respondWith(staleWhileRevalidate(req, API_CACHE));
  }
});

async function networkFirstNavigation(req) {
  const cache = await caches.open(PAGE_CACHE);
  try {
    const fresh = await fetch(req);
    cache.put(req, fresh.clone());
    return fresh;
  } catch {
    const cached = await cache.match(req);
    if (cached) return cached;
    const offline = await cache.match(OFFLINE_URL);
    return offline ?? Response.error();
  }
}

async function cacheFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(req);
  if (cached) return cached;
  const fresh = await fetch(req);
  if (fresh.ok) cache.put(req, fresh.clone());
  return fresh;
}

async function staleWhileRevalidate(req, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(req);
  const fetching = fetch(req)
    .then((fresh) => {
      if (fresh.ok) cache.put(req, fresh.clone());
      return fresh;
    })
    .catch(() => cached);
  return cached ?? fetching;
}
