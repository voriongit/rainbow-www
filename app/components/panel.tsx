// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Vorion LLC

import type { ReactNode } from 'react';

interface PanelProps {
  title: string;
  subtitle?: string;
  badge?: ReactNode;
  footnote?: string;
  children: ReactNode;
  className?: string;
}

/** Shared dashboard panel shell */
export function Panel({ title, subtitle, badge, footnote, children, className = '' }: PanelProps) {
  return (
    <section
      className={`rounded-xl border border-white/10 bg-white/[0.02] p-5 flex h-full flex-col gap-4 ${className}`}
    >
      <header className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold tracking-wide text-white/90">{title}</h2>
          {subtitle && <p className="mt-0.5 text-xs text-white/45">{subtitle}</p>}
        </div>
        {badge}
      </header>
      <div className="flex-1">{children}</div>
      {footnote && <p className="text-[11px] leading-relaxed text-white/35">{footnote}</p>}
    </section>
  );
}

/** Honest empty state — shown when a window genuinely has no signals */
export function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex h-40 items-center justify-center rounded-lg border border-dashed border-white/10">
      <p className="text-xs text-white/40">{message}</p>
    </div>
  );
}
