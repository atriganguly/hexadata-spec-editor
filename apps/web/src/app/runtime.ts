import { AssetCache } from '../assets/asset-cache.ts';
import { IdbDraftStore } from '../drafts/idb-store.ts';
import { SessionController } from '../drafts/session.ts';

/**
 * The app's long-lived objects, created on first use (so importing a component never opens a database).
 * Tests that need isolation build their own `SessionController` instead.
 */
interface Runtime {
  store: IdbDraftStore;
  assets: AssetCache;
  session: SessionController;
}

let instance: Runtime | undefined;

export function runtime(): Runtime {
  if (!instance) {
    const store = IdbDraftStore.open();
    const assets = new AssetCache(store);
    instance = { store, assets, session: new SessionController(store, assets) };
  }
  return instance;
}
