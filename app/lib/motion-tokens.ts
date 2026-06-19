// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Vorion LLC

/**
 * Motion design tokens — one source of truth for durations, easings, springs and
 * shared variants so the app (and sibling Vorion sites) feel cohesive. Keep
 * animated components importing from here rather than inlining magic numbers.
 */

import type { Variants, Transition } from 'motion/react';

export const DURATION = {
  instant: 0.12,
  fast: 0.18,
  base: 0.24,
  slow: 0.4,
} as const;

export const EASE_OUT: [number, number, number, number] = [0.22, 1, 0.36, 1];

export const SPRING_SOFT: Transition = { type: 'spring', stiffness: 260, damping: 30 };
export const SPRING_SNAPPY: Transition = { type: 'spring', stiffness: 400, damping: 35 };

/** Distances/thresholds shared by reveal + (Phase 1) gesture code. */
export const REVEAL_RISE = 12;

/** Entrance: fade + small rise. `visible` accepts a stagger delay via `custom`.
 *  Under prefers-reduced-motion, MotionConfig drops the transform; the opacity
 *  fade remains, so content still appears (never hidden). */
export const fadeRise: Variants = {
  hidden: { opacity: 0, y: REVEAL_RISE },
  visible: (delay = 0) => ({
    opacity: 1,
    y: 0,
    transition: { duration: DURATION.base, ease: EASE_OUT, delay },
  }),
};
