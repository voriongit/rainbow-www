// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Vorion LLC

'use client';

/**
 * Tasteful "Add to Home Screen" chip. Android/Chrome uses the captured
 * `beforeinstallprompt`; iOS Safari (which has no such event) gets a short
 * manual instruction instead. Hidden when already installed/standalone, and a
 * dismissal is remembered (a tiny UI-chrome flag in localStorage — not trust
 * data). Floats above the mobile bottom nav.
 */

import { useEffect, useState } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const DISMISS_KEY = 'rainbow.installDismissed';

export function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [iosHint, setIosHint] = useState(false);
  const [show, setShow] = useState(false);

  useEffect(() => {
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as unknown as { standalone?: boolean }).standalone === true;
    if (standalone) return;
    try {
      if (localStorage.getItem(DISMISS_KEY)) return;
    } catch {
      /* private mode — proceed without persistence */
    }

    const onBIP = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      setShow(true);
    };
    window.addEventListener('beforeinstallprompt', onBIP);

    const ua = navigator.userAgent;
    const isIOS =
      /iphone|ipad|ipod/i.test(ua) ||
      (navigator as unknown as { standalone?: boolean }).standalone !== undefined;
    const isSafari = /^((?!chrome|android).)*safari/i.test(ua);
    // Defer out of the effect body (lint: react-hooks/set-state-in-effect) — also
    // avoids an immediate render cascade on mount.
    let raf = 0;
    if (isIOS && isSafari) {
      raf = requestAnimationFrame(() => {
        setIosHint(true);
        setShow(true);
      });
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', onBIP);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  if (!show) return null;

  const dismiss = () => {
    setShow(false);
    try {
      localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      /* ignore */
    }
  };

  const install = async () => {
    if (!deferred) return;
    await deferred.prompt();
    try {
      await deferred.userChoice;
    } catch {
      /* ignore */
    }
    setDeferred(null);
    dismiss();
  };

  return (
    <div className="fixed inset-x-3 bottom-[calc(4rem+env(safe-area-inset-bottom)+0.5rem)] z-50 mx-auto max-w-sm rounded-xl border border-white/15 bg-[#0c0c14]/95 p-3 shadow-2xl backdrop-blur md:bottom-4">
      <div className="flex items-start gap-3">
        <div className="flex-1 text-xs">
          <div className="font-semibold text-white/90">Install RAINBOW</div>
          <div className="mt-0.5 leading-snug text-white/55">
            {iosHint ? (
              <>
                Tap <span className="text-white/80">Share</span> →{' '}
                <span className="text-white/80">Add to Home Screen</span>.
              </>
            ) : (
              'Add it to your home screen for a full-screen, app-like view.'
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {!iosHint && (
            <button
              type="button"
              onClick={install}
              className="rounded-md border border-white/20 bg-white/[0.06] px-2.5 py-1 text-xs font-medium text-white/90 transition-colors hover:border-white/40 [touch-action:manipulation]"
            >
              Install
            </button>
          )}
          <button
            type="button"
            onClick={dismiss}
            aria-label="Dismiss install prompt"
            className="rounded-md px-2 py-1 text-xs text-white/40 transition-colors hover:text-white/70 [touch-action:manipulation]"
          >
            ✕
          </button>
        </div>
      </div>
    </div>
  );
}
