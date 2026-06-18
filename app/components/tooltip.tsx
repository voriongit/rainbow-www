// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Vorion LLC

/**
 * Hover/focus tooltip — CSS-only (Tailwind `group`), so it stays a server
 * component with zero client JS. Wrap any element to give it an in-place
 * explanation that appears on hover or keyboard focus. It does not capture
 * clicks, so a wrapped link/button keeps its own behaviour.
 *
 * The trigger is focusable (`tabIndex=0`) so a TAP reveals it via
 * `:focus-within` on touch devices (CSS `:hover` never fires on touch); a tap
 * elsewhere blurs it. Width is clamped to the viewport so it never clips off a
 * narrow phone screen.
 *
 * `ConceptTooltip` is the glossary-backed convenience: pass a concept slug and
 * it shows that concept's one-line summary.
 */

import type { ReactNode } from 'react';
import { getConcept } from '../lib/glossary';

interface TooltipProps {
  content: ReactNode;
  children: ReactNode;
  className?: string;
  /** Where the bubble appears relative to the trigger. */
  side?: 'top' | 'bottom';
}

export function Tooltip({ content, children, className = '', side = 'top' }: TooltipProps) {
  if (!content) return <>{children}</>;
  const pos =
    side === 'top'
      ? 'bottom-full mb-1.5'
      : 'top-full mt-1.5';
  return (
    <span
      tabIndex={0}
      className={`group/tip relative inline-flex rounded-sm outline-none [touch-action:manipulation] focus-visible:ring-1 focus-visible:ring-white/30 ${className}`}
    >
      {children}
      <span
        role="tooltip"
        className={`pointer-events-none absolute left-1/2 z-50 hidden w-max max-w-[min(240px,calc(100vw-2rem))] -translate-x-1/2 whitespace-normal rounded-md border border-white/15 bg-[#0c0c14] px-2.5 py-1.5 text-left text-[11px] font-normal normal-case leading-snug tracking-normal text-white/80 shadow-lg group-hover/tip:block group-focus-within/tip:block ${pos}`}
      >
        {content}
      </span>
    </span>
  );
}

interface ConceptTooltipProps {
  slug: string;
  children: ReactNode;
  className?: string;
  side?: 'top' | 'bottom';
}

/** Tooltip whose content is a glossary concept's one-line summary. */
export function ConceptTooltip({ slug, children, className, side }: ConceptTooltipProps) {
  const concept = getConcept(slug);
  return (
    <Tooltip content={concept?.short} className={className} side={side}>
      {children}
    </Tooltip>
  );
}
