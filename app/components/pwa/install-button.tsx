// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Vorion LLC

'use client';

import { OPEN_INSTALL_EVENT } from './install-prompt';

/** Menu-style entry point for the install sheet; it never opens on its own. */
export function InstallButton({ className = '' }: { className?: string }) {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new CustomEvent(OPEN_INSTALL_EVENT))}
      className={`underline [touch-action:manipulation] hover:text-white/60 ${className}`}
    >
      Install app
    </button>
  );
}
