// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Vorion LLC

'use client';

/**
 * Scroll-into-view entrance (fade + small rise), once. A client island that
 * wraps server-rendered children, so panels stay RSC. `once` avoids re-animating
 * on scroll-up — better for a tool you actually read. Reduced-motion users get
 * the opacity fade with no movement (via MotionConfig).
 */

import { m } from 'motion/react';
import type { ReactNode } from 'react';
import { fadeRise } from '../../lib/motion-tokens';

export function Reveal({
  children,
  delay = 0,
  className,
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}) {
  return (
    <m.div
      className={className}
      variants={fadeRise}
      custom={delay}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, amount: 0.15 }}
    >
      {children}
    </m.div>
  );
}
