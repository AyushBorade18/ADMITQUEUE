'use client';
import { useEffect } from 'react';
import { applyUpdate, promptInstall, startPwa, usePwa } from '@/lib/client/pwa';

/** Banner for offline / update available. Rendered once in the root layout. */
export function PwaStatus() {
  const pwa = usePwa();
  useEffect(() => {
    startPwa();
  }, []);
  if (pwa.online && !pwa.updateReady) return null;
  return (
    <div className="pwa-banner" role="status" aria-live="polite">
      {!pwa.online ? (
        <span>
          <strong>You are offline.</strong> Your records and changes need a connection. Nothing you do now is saved.
        </span>
      ) : (
        <span>
          <strong>A new version is available.</strong>{' '}
          <button type="button" className="btn btn-sm btn-light ms-2" onClick={applyUpdate}>
            Reload to update
          </button>
        </span>
      )}
    </div>
  );
}

export function InstallButton() {
  const pwa = usePwa();
  if (!pwa.canInstall || pwa.installed) return null;
  return (
    <button type="button" className="btn btn-outline-primary btn-sm" onClick={() => promptInstall()}>
      Install app
    </button>
  );
}

export function OnlineDot() {
  const pwa = usePwa();
  return (
    <span className={`online-dot ${pwa.online ? 'on' : 'off'}`} title={pwa.online ? 'Online' : 'Offline'} aria-label={pwa.online ? 'Online' : 'Offline'} />
  );
}
