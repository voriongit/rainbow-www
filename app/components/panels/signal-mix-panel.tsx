// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Vorion LLC

import type { SignalDistribution } from '@vorionsys/rainbow';
import { TransitionsPanel } from './transitions-panel';

/**
 * Fleet signal mix: pooled outcome / severity / type / risk-level counts.
 * Counts add across agents, so pooling is honest here; tier transitions do not
 * (they need one agent's score path) and are left to the agent view.
 */
export function SignalMixPanel({
  distribution,
  subtitle,
  duration,
}: {
  distribution: SignalDistribution;
  subtitle: string;
  duration: string;
}) {
  return <TransitionsPanel distribution={distribution} agentId={subtitle} duration={duration} />;
}
