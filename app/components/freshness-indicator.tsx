// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Vorion LLC

'use client';

/**
 * Honesty badge for the (now `revalidate`d / SW-cacheable) dashboard: shows how
 * old the rendered snapshot is ("as of N min ago") and an explicit "Offline —
 * last-seen" state, so cached/stale synthetic data is never presented as live.
 *
 * Renders nothing until mounted (the relative age can't be computed on the
 * server), so there is no hydration mismatch — it's a pure enhancement on top of
 * the always-present "Computed {time} UTC" notice.
 */

import { useEffect, useState } from 'react';

export function FreshnessIndicator({ computedAt }: { computedAt: string }) {
  const [nowMs, setNowMs] = useState<number | null>(null);
  const [online, setOnline] = useState(true);

  useEffect(() => {
    const tick = () => setNowMs(Date.now());
    tick();
    const id = setInterval(tick, 15_000);
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    setOnline(navigator.onLine);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      clearInterval(id);
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  if (nowMs == null) return null;

  const ageSec = Math.max(0, Math.round((nowMs - new Date(computedAt).getTime()) / 1000));
  const rel =
    ageSec < 45
      ? 'just now'
      : ageSec < 90
        ? '1 min ago'
        : ageSec < 3600
          ? `${Math.round(ageSec / 60)} min ago`
          : `${Math.round(ageSec / 3600)}h ago`;

  return (
    <span className="inline-flex items-center gap-1.5">
      {!online && (
        <span className="rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-300/90">
          Offline — last-seen
        </span>
      )}
      <span className="text-white/40">as of {rel}</span>
    </span>
  );
}
