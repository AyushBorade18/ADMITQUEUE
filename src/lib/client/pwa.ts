'use client';
// Small store for PWA state: online/offline, "install" prompt, "update available".
import { useSyncExternalStore } from 'react';

type BeforeInstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> };
type State = { online: boolean; canInstall: boolean; updateReady: boolean; installed: boolean };

let state: State = { online: true, canInstall: false, updateReady: false, installed: false };
<<<<<<< HEAD
// must be ONE stable object: React calls getServerSnapshot repeatedly and requires the same reference each time
const SERVER_STATE: State = { online: true, canInstall: false, updateReady: false, installed: false };
=======
>>>>>>> 89de309f19d2115fe6181c86cab66f16ea2c6f52
const listeners = new Set<() => void>();
let deferredPrompt: BeforeInstallPromptEvent | null = null;
let waitingWorker: ServiceWorker | null = null;
let started = false;

function set(patch: Partial<State>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

export function startPwa() {
  if (started || typeof window === 'undefined') return;
  started = true;
  set({ online: navigator.onLine, installed: window.matchMedia('(display-mode: standalone)').matches });
  window.addEventListener('online', () => set({ online: true }));
  window.addEventListener('offline', () => set({ online: false }));
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e as BeforeInstallPromptEvent;
    set({ canInstall: true });
  });
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    set({ canInstall: false, installed: true });
  });

  // The service worker is only registered in production builds (in development it would cache old code).
  if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
    navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .then((reg) => {
        const track = (worker: ServiceWorker | null) => {
          if (!worker) return;
          worker.addEventListener('statechange', () => {
            if (worker.state === 'installed' && navigator.serviceWorker.controller) {
              waitingWorker = worker;
              set({ updateReady: true });
            }
          });
        };
        if (reg.waiting && navigator.serviceWorker.controller) {
          waitingWorker = reg.waiting;
          set({ updateReady: true });
        }
        reg.addEventListener('updatefound', () => track(reg.installing));
        // look for a new version whenever the app is opened again
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') reg.update().catch(() => undefined);
        });
      })
      .catch(() => undefined);
    let reloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloading) return;
      reloading = true;
      window.location.reload();
    });
  }
}

export async function promptInstall(): Promise<void> {
  if (!deferredPrompt) return;
  await deferredPrompt.prompt();
  await deferredPrompt.userChoice;
  deferredPrompt = null;
  set({ canInstall: false });
}

export function applyUpdate() {
  if (waitingWorker) waitingWorker.postMessage({ type: 'SKIP_WAITING' });
  else window.location.reload();
}

export function usePwa(): State {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => state,
<<<<<<< HEAD
    () => SERVER_STATE,
=======
    () => ({ online: true, canInstall: false, updateReady: false, installed: false }),
>>>>>>> 89de309f19d2115fe6181c86cab66f16ea2c6f52
  );
}
