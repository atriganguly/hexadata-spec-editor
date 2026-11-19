import { Workbox } from 'workbox-window';

interface Handlers {
  /** A new version is installed and waiting; call `apply` to switch to it (reloads the page). */
  onUpdate(apply: () => void): void;
  /** First install finished: the app now works offline. */
  onOfflineReady(): void;
}

/**
 * Registers the service worker that precaches the app shell (instant reloads, offline editing). Updates are
 * never forced: the user is offered "Reload" so an open draft is never interrupted mid-edit.
 */
export function registerServiceWorker({ onUpdate, onOfflineReady }: Handlers): void {
  if (import.meta.env.DEV || !('serviceWorker' in navigator)) return;
  const wb = new Workbox(`${import.meta.env.BASE_URL}sw.js`);
  wb.addEventListener('waiting', () => {
    onUpdate(() => {
      wb.addEventListener('controlling', () => location.reload());
      wb.messageSkipWaiting();
    });
  });
  wb.addEventListener('installed', (event) => {
    if (!event.isUpdate) onOfflineReady();
  });
  wb.register().catch(() => undefined);
}
