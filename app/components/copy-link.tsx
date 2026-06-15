// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Vorion LLC
'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, Link2 } from 'lucide-react';

export function CopyLink({ className }: { className?: string }) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const handleClick = async () => {
    if (typeof navigator === 'undefined' || !navigator.clipboard) return;
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setCopied(false), 1500);
    } catch {
      // no-op: clipboard write rejected (e.g. permissions)
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label="Copy link to this view"
      className={`inline-flex items-center gap-1.5 text-xs text-white/45 transition-colors hover:text-white/80 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/30 ${className ?? ''}`}
    >
      {copied ? (
        <Check size={13} aria-hidden="true" />
      ) : (
        <Link2 size={13} aria-hidden="true" />
      )}
      <span>{copied ? 'Copied ✓' : 'Copy link'}</span>
    </button>
  );
}
