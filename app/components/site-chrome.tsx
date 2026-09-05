// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Vorion LLC

import Link from 'next/link';

const LINKS = [
  { href: '/', label: 'Fleet' },
  { href: '/compare', label: 'Compare' },
  { href: '/lab', label: 'Lab' },
  { href: '/concepts', label: 'Concepts' },
] as const;

/**
 * Desktop-only top bar. Mobile already has the thumb tab bar.
 * Hidden on embed widgets via `body:has(.embed-page)` in globals.css.
 */
export function SiteChrome() {
  return (
    <header className="site-chrome print:hidden hidden border-b border-white/10 bg-[#05050a]/90 md:block">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-2.5 sm:px-6 lg:px-8">
        <div className="flex items-center gap-2 text-[11px]">
          <a
            href="https://vorion.org"
            className="font-semibold tracking-wider text-white/55 transition-colors hover:text-white/85"
          >
            VORION
          </a>
          <span className="text-white/20">/</span>
          <Link href="/" className="font-semibold tracking-wider text-white/80 hover:text-white">
            RAINBOW
          </Link>
        </div>
        <nav aria-label="Primary" className="flex items-center gap-4 text-xs text-white/55">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} className="transition-colors hover:text-white">
              {l.label}
            </Link>
          ))}
          <span className="text-[11px] text-white/30" title="Press ⌘K (or Ctrl-K) to search">
            ⌘K
          </span>
        </nav>
      </div>
    </header>
  );
}
