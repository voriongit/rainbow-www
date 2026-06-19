// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Vorion LLC

/**
 * The house drill-down link. A thin styled wrapper over next/link so every
 * clickable dashboard element shares one hover/focus affordance and the
 * "this leads somewhere" cue. Server-renderable (next/link works in RSC).
 *
 * View state stays in the URL (the app's convention), so callers build hrefs
 * that carry the active window where relevant, e.g.
 *   exploreHref('/agent/cascade-03', { window })
 */

import Link from 'next/link';
import type { CSSProperties, ReactNode } from 'react';

export function exploreHref(
  path: string,
  params?: Record<string, string | undefined>
): string {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params ?? {})) {
    if (v !== undefined && v !== '') qs.set(k, v);
  }
  const s = qs.toString();
  return s ? `${path}?${s}` : path;
}

interface ExploreLinkProps {
  href: string;
  children: ReactNode;
  className?: string;
  /** Visual style: 'inline' (underline-on-hover) or 'block' (whole-row/cell target). */
  variant?: 'inline' | 'block';
  title?: string;
  ariaLabel?: string;
  /** Inline style escape hatch (e.g. a data-driven heatmap cell color). */
  style?: CSSProperties;
}

export function ExploreLink({
  href,
  children,
  className = '',
  variant = 'inline',
  title,
  ariaLabel,
  style,
}: ExploreLinkProps) {
  const base =
    variant === 'block'
      ? 'block rounded-lg transition-colors hover:bg-white/[0.04] focus-visible:bg-white/[0.04] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/30'
      : 'underline-offset-2 transition-colors hover:text-white hover:underline focus-visible:underline focus-visible:outline-none';
  return (
    <Link
      href={href}
      title={title}
      aria-label={ariaLabel}
      style={style}
      className={`${base} ${className}`}
    >
      {children}
    </Link>
  );
}
