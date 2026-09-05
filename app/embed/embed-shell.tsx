// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Vorion LLC

/**
 * Embeddable-widget shell. Every /embed/* widget renders inside this so it is
 * visually self-contained for iframe use: it owns its own dark, transparent-
 * friendly card and stamps a prominent synthetic-demo badge (top of the card)
 * plus a footer attribution on every widget (a guardrail — these are read-only
 * views over a deterministic simulator, never live agents). Because a widget can
 * be lifted into a third-party page via <iframe>, losing all surrounding site
 * context, the synthetic label sits ON the widget body at the same prominence as
 * the honesty banners on /proof and /model — never a low-contrast footnote alone.
 * The global chrome (MobileNav / CommandPalette / InstallPrompt)
 * is mounted in layout.tsx and CANNOT be edited from here; it is `md:hidden` +
 * fixed, so at the small sizes these widgets are meant to be embedded at it does
 * not intrude. Widgets are kept compact and zero-dependency.
 */

import type { ReactNode } from 'react';
import { getProvenance } from '../lib/data-source';

interface EmbedShellProps {
  children: ReactNode;
  /** Optional href the attribution chip deep-links to (defaults to the site). */
  href?: string;
  className?: string;
}

/** Subtle, claim-safe attribution carried by every embeddable widget. */
export function EmbedAttribution({ href }: { href?: string }) {
  return (
    <a
      href={href ?? 'https://rainbow.vorion.org'}
      target="_blank"
      rel="noopener noreferrer"
      className="group mt-2 flex items-center gap-1.5 text-[9px] uppercase tracking-[0.12em] text-white/35 no-underline transition-colors hover:text-white/55"
    >
      <span
        className="inline-block h-1.5 w-8 shrink-0 rounded-full opacity-70"
        style={{
          backgroundImage:
            'linear-gradient(90deg,#6b7280,#ef4444,#f97316,#eab308,#22c55e,#06b6d4,#6366f1,#a855f7)',
        }}
        aria-hidden="true"
      />
      <span className="truncate">RAINBOW · vorion.org</span>
    </a>
  );
}

/**
 * Prominent, always-visible synthetic-demo badge carried at the top of every
 * embeddable widget. These widgets are built to be embedded off-site via
 * <iframe>, where they lose all surrounding site context — so the synthetic
 * label must be unmissable on the widget body itself, at the same prominence as
 * the honesty banners on /proof and /model (a visible tinted chip, not a faint
 * footnote). Matches the amber honesty idiom used elsewhere on the site.
 */
export function SyntheticBadge() {
  const live = getProvenance().mode === 'live';
  return (
    <div className="mb-3 flex items-center">
      <span
        className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] ${
          live
            ? 'border-emerald-400/30 bg-emerald-400/[0.10] text-emerald-100/90'
            : 'border-amber-400/30 bg-amber-400/[0.10] text-amber-100/90'
        }`}
      >
        <span
          className={`inline-block h-1.5 w-1.5 rounded-full ${live ? 'bg-emerald-400/80' : 'bg-amber-400/80'}`}
          aria-hidden="true"
        />
        {live ? 'Live telemetry' : 'Demo fleet'}
      </span>
    </div>
  );
}

/** Self-contained card frame for an embeddable widget. */
export function EmbedShell({ children, href, className = '' }: EmbedShellProps) {
  return (
    <div className="embed-page min-h-dvh w-full bg-transparent p-3 text-white antialiased">
      <div
        className={`mx-auto flex max-w-md flex-col rounded-xl border border-white/10 bg-[#05050a]/80 p-4 shadow-[0_1px_0_0_rgba(255,255,255,0.04)_inset] backdrop-blur ${className}`}
      >
        <SyntheticBadge />
        {children}
        <EmbedAttribution href={href} />
      </div>
    </div>
  );
}
