// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Vorion LLC

'use client';

/**
 * Global ⌘K / Ctrl-K command palette. Pure client overlay: a global keydown
 * listener toggles it open, fuzzy-free substring search filters the supplied
 * items, and Enter / click navigates via the App Router. Items are passed in
 * from a server parent — this component never touches the (server-only)
 * data source.
 */

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export type CommandKind = 'agent' | 'factor' | 'tier' | 'concept' | 'page';

export interface CommandItem {
  kind: CommandKind;
  label: string;
  sublabel?: string;
  href: string;
}

const MAX_RESULTS = 40;

/** Display order + human labels for the per-kind group headers. */
const KIND_ORDER: CommandKind[] = ['agent', 'factor', 'tier', 'concept', 'page'];
const KIND_LABEL: Record<CommandKind, string> = {
  agent: 'Agents',
  factor: 'Factors',
  tier: 'Tiers',
  concept: 'Concepts',
  page: 'Pages',
};

export function CommandPalette({ items }: { items: CommandItem[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);

  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Flat, capped, query-filtered list (kept stable per render for keyboard nav).
  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matched = q
      ? items.filter((it) =>
          `${it.label} ${it.sublabel ?? ''}`.toLowerCase().includes(q)
        )
      : items;
    return matched.slice(0, MAX_RESULTS);
  }, [items, query]);

  // Group the (already-capped) flat list while preserving its order, so the
  // visible index used for highlighting matches the flat `results` index.
  const groups = useMemo(() => {
    const byKind = new Map<CommandKind, { item: CommandItem; index: number }[]>();
    results.forEach((item, index) => {
      const bucket = byKind.get(item.kind) ?? [];
      bucket.push({ item, index });
      byKind.set(item.kind, bucket);
    });
    return KIND_ORDER.filter((k) => byKind.has(k)).map((kind) => ({
      kind,
      rows: byKind.get(kind)!,
    }));
  }, [results]);

  // Effective selection, clamped to the current result set at render time
  // (derive rather than sync state in an effect).
  const selectedIndex = results.length === 0 ? 0 : Math.min(selected, results.length - 1);

  const close = useCallback(() => setOpen(false), []);

  // Global toggle: ⌘K / Ctrl-K opens (and closes) the palette. The reset lives
  // here (an event handler), not in an effect, so it never cascades renders.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setQuery('');
        setSelected(0);
        setOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Focus the input after the overlay paints (no state writes here).
  useEffect(() => {
    if (!open) return;
    const id = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [open]);

  // Keep the highlighted row scrolled into view.
  useEffect(() => {
    if (!open) return;
    const el = listRef.current?.querySelector<HTMLElement>('[data-selected="true"]');
    el?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex, open]);

  const navigate = useCallback(
    (item: CommandItem) => {
      close();
      router.push(item.href);
    },
    [close, router]
  );

  const onInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
      return;
    }
    if (results.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelected((selectedIndex + 1) % results.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelected((selectedIndex - 1 + results.length) % results.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const item = results[selectedIndex];
      if (item) navigate(item);
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex justify-center bg-black/60 pt-[12vh]"
      onMouseDown={(e) => {
        // Backdrop click closes; clicks inside the panel are stopped below.
        if (e.target === e.currentTarget) close();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        className="h-fit w-full max-w-lg rounded-xl border border-white/15 bg-[#0c0c14] shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="border-b border-white/10 px-3 py-2.5">
          <input
            ref={inputRef}
            autoFocus
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelected(0);
            }}
            onKeyDown={onInputKeyDown}
            aria-label="Search agents, factors, tiers, concepts, and pages"
            placeholder="Search agents, factors, tiers, concepts…"
            className="w-full bg-transparent text-sm text-white/90 placeholder:text-white/40 outline-none focus-visible:outline-none"
          />
        </div>

        <div
          ref={listRef}
          role="listbox"
          aria-label="Command palette results"
          className="max-h-80 overflow-y-auto py-1"
        >
          {results.length === 0 ? (
            <div className="px-3 py-6 text-center text-[13px] text-white/40">
              No matches
            </div>
          ) : (
            groups.map((group) => (
              <div key={group.kind} className="px-1 pb-1">
                <div className="px-2 pt-2 pb-1 text-[11px] uppercase tracking-wider text-white/40">
                  {KIND_LABEL[group.kind]}
                </div>
                {group.rows.map(({ item, index }) => {
                  const active = index === selectedIndex;
                  return (
                    <button
                      key={`${item.kind}:${item.href}:${index}`}
                      type="button"
                      role="option"
                      aria-selected={active}
                      data-selected={active}
                      onMouseEnter={() => setSelected(index)}
                      onClick={() => navigate(item)}
                      className={`flex w-full items-baseline gap-2 rounded-lg px-2 py-1.5 text-left transition-colors focus-visible:outline-none ${
                        active ? 'bg-white/[0.06]' : 'hover:bg-white/[0.04]'
                      }`}
                    >
                      <span className="truncate text-[13px] text-white/90">
                        {item.label}
                      </span>
                      {item.sublabel ? (
                        <span className="ml-auto shrink-0 truncate text-[11px] text-white/40">
                          {item.sublabel}
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
