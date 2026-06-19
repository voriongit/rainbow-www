// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Vorion LLC

'use client';

/**
 * Thumb-reachable bottom tab bar — mobile only (`md:hidden`; desktop keeps the
 * in-page header nav untouched). Safe-area aware so it floats above the iOS home
 * indicator. The "Search" tab opens the ⌘K command palette via a CustomEvent
 * (the palette is keyboard-only otherwise — there was no touch affordance).
 *
 * Active state derives from `usePathname()`, which is deterministic on server +
 * client, so there is no hydration mismatch.
 */

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, GitCompare, FlaskConical, BookOpen, Search } from 'lucide-react';

const TABS = [
  { href: '/', label: 'Fleet', icon: LayoutDashboard, match: (p: string) => p === '/' || p.startsWith('/agent') },
  { href: '/compare', label: 'Compare', icon: GitCompare, match: (p: string) => p.startsWith('/compare') },
  { href: '/lab', label: 'Lab', icon: FlaskConical, match: (p: string) => p.startsWith('/lab') },
  { href: '/concepts', label: 'Concepts', icon: BookOpen, match: (p: string) => p.startsWith('/concepts') },
] as const;

export function MobileNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-[#0c0c14]/95 pb-safe-b backdrop-blur md:hidden"
    >
      <ul className="flex">
        {TABS.map((t) => {
          const active = t.match(pathname);
          const Icon = t.icon;
          return (
            <li key={t.href} className="flex-1">
              <Link
                href={t.href}
                aria-current={active ? 'page' : undefined}
                className={`flex min-h-[44px] flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-medium [touch-action:manipulation] transition-colors ${
                  active ? 'text-white' : 'text-white/45 hover:text-white/70'
                }`}
              >
                <Icon className="h-5 w-5" strokeWidth={active ? 2.4 : 1.8} aria-hidden="true" />
                {t.label}
              </Link>
            </li>
          );
        })}
        <li className="flex-1">
          <button
            type="button"
            onClick={() => window.dispatchEvent(new CustomEvent('rainbow:open-palette'))}
            aria-label="Search agents, factors, tiers, concepts, and pages"
            className="flex min-h-[44px] w-full flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-medium text-white/45 [touch-action:manipulation] transition-colors hover:text-white/70"
          >
            <Search className="h-5 w-5" strokeWidth={1.8} aria-hidden="true" />
            Search
          </button>
        </li>
      </ul>
    </nav>
  );
}
