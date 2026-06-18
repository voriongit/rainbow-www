// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Vorion LLC

'use client';

/**
 * App-wide motion context. A thin client wrapper that holds server-rendered
 * children as a slot, so every page stays an RSC while `m` components anywhere
 * below get features + global reduced-motion handling.
 *
 * - LazyMotion(domAnimation): the small feature bundle (~no drag/layout) loaded
 *   lazily after first paint; with `strict` we only ever use `m.*`, never the
 *   heavier `motion.*`.
 * - MotionConfig reducedMotion="user": honors the OS setting globally — transform
 *   animations are dropped (opacity kept) without per-component code.
 */

import { LazyMotion, domAnimation, MotionConfig } from 'motion/react';
import type { ReactNode } from 'react';

export function MotionProvider({ children }: { children: ReactNode }) {
  return (
    <LazyMotion features={domAnimation} strict>
      <MotionConfig reducedMotion="user">{children}</MotionConfig>
    </LazyMotion>
  );
}
