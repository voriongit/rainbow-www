// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Vorion LLC

/**
 * The risk accumulator counts a failure only when it carries a tier and a known
 * risk level. A failure without them is left out, never estimated, and the
 * library reports how many it left out. Without this notice a source that omits
 * those fields produces a risk panel that reads zero, which looks like "no
 * risk" when the truth is "not measured".
 */

export function AccumulatorUndercount({
  count,
  scope,
}: {
  /** Failures left out of the accumulator. Renders nothing when zero. */
  count: number;
  scope: string;
}) {
  if (count <= 0) return null;
  const one = count === 1;
  return (
    <p
      role="note"
      className="rounded-md border border-amber-500/30 bg-amber-500/[0.06] px-3 py-2 text-xs leading-relaxed text-amber-200/90"
    >
      {count} failure{one ? '' : 's'} {scope} {one ? 'has' : 'have'} no usable tier or risk level, so{' '}
      {one ? 'it is' : 'they are'} not counted. The pressure shown is a lower bound, not a
      measurement of zero.
    </p>
  );
}
