// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Vorion LLC

'use client';

/**
 * "Add to Home Screen" sheet — opened on request only, never on its own.
 *
 * It used to pop up on load and remember a dismissal in localStorage; the site
 * otherwise refuses browser storage, and a sheet that cannot remember being
 * dismissed keeps returning over the content. Now it listens for the
 * `rainbow:open-install` event (dispatched by <InstallButton/> in the footer)
 * and nothing persists. Android/Chrome uses the captured `beforeinstallprompt`;
 * iOS Safari gets the manual Share → Add to Home Screen instruction; other
 * browsers are told plainly that they offer no install.
 */

import { useEffect, useState } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export const OPEN_INSTALL_EVENT = 'rainbow:open-install';

export function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [iosHint, setIosHint] = useState(false);
  const [show, setShow] = useState(false);

  useEffect(() => {
    const onBIP = (e: Event) => {
      // Keep the browser's own mini-infobar from appearing; offer it on request.
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onOpen = () => {
      const ua = navigator.userAgent;
      const isIOS = /iphone|ipad|ipod/i.test(ua);
      const isSafari = /^((?!chrome|android).)*safari/i.test(ua);
      setIosHint(isIOS && isSafari);
      setShow(true);
    };
    window.addEventListener('beforeinstallprompt', onBIP);
    window.addEventListener(OPEN_INSTALL_EVENT, onOpen);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBIP);
      window.removeEventListener(OPEN_INSTALL_EVENT, onOpen);
    };
  }, []);

  if (!show) return null;

  const dismiss = () => setShow(false);

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
    <div
      role="dialog"
      aria-label="Install RAINBOW"
      className="fixed inset-x-3 bottom-[calc(4rem+env(safe-area-inset-bottom)+0.5rem)] z-50 mx-auto max-w-sm rounded-xl border border-white/15 bg-[#0c0c14]/95 p-3 shadow-2xl backdrop-blur md:bottom-4"
    >
      <div className="flex items-start gap-3">
        <div className="flex-1 text-xs">
          <div className="font-semibold text-white/90">Install RAINBOW</div>
          <div className="mt-0.5 leading-snug text-white/55">
            {iosHint ? (
              <>
                Tap <span className="text-white/80">Share</span> →{' '}
                <span className="text-white/80">Add to Home Screen</span>.
              </>
            ) : deferred ? (
              'Add it to your home screen for a full-screen, app-like view.'
            ) : (
              'This browser does not offer an install option here. Use its menu (Add to Home Screen / Install app) if available.'
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {!iosHint && deferred && (
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
