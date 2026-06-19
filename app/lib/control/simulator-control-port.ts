// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Vorion LLC

/**
 * SimulatorControlPort — the demo-mode implementation of the READ-ONLY
 * GovernanceControlPort.
 *
 * It resolves illustrative effective configuration from the operation modes +
 * reference merge. It is `mode() === 'demo'`, READ-ONLY (no apply/write), and
 * every payload it returns is stamped `synthetic: true`. It never touches a
 * live agent or a backend — it is the model, not control.
 */

import type {
  ControlInput,
  EffectiveConfig,
  GovernanceControlPort,
} from './contract';
import { resolveEffectiveConfig } from './effective-config';

export class SimulatorControlPort implements GovernanceControlPort {
  mode(): 'demo' | 'live' {
    return 'demo';
  }

  getEffectiveConfig(input: ControlInput): EffectiveConfig {
    const resolved = resolveEffectiveConfig(input);
    // Defensive: guarantee the synthetic stamp regardless of merge internals.
    return { ...resolved, synthetic: true };
  }
}

/** Shared singleton — the model is stateless, so one instance is fine. */
export const simulatorControlPort = new SimulatorControlPort();
