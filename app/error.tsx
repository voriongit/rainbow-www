// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Vorion LLC

'use client';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="mx-auto flex max-w-lg flex-col gap-4 px-4 py-16 text-center">
      <h1 className="text-xl font-semibold text-white/90">This view failed to compute</h1>
      <p className="text-sm text-white/50">
        Rainbow is read-only analytics. Nothing was written. You can retry or go back to the fleet.
      </p>
      {error.digest ? (
        <p className="font-mono text-[11px] text-white/30">digest {error.digest}</p>
      ) : null}
      <div className="flex justify-center gap-3">
        <button
          type="button"
          onClick={reset}
          className="rounded-md border border-white/20 px-4 py-2 text-sm text-white/80 hover:bg-white/5"
        >
          Try again
        </button>
        <a
          href="/"
          className="rounded-md border border-white/20 px-4 py-2 text-sm text-white/80 hover:bg-white/5"
        >
          Fleet
        </a>
      </div>
    </main>
  );
}
