import { useSyncExternalStore } from 'react';
import { useUi } from '../store/ui.ts';

/** Below this width the side panels become overlays (matches the CSS breakpoint in app.css). */
export const NARROW_QUERY = '(max-width: 63.99rem)';

/** Subscribes to a CSS media query. */
export function useMedia(query: string): boolean {
  return useSyncExternalStore(
    (notify) => {
      const list = window.matchMedia(query);
      list.addEventListener('change', notify);
      return () => list.removeEventListener('change', notify);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

/**
 * Side-panel visibility. Until the user chooses, panels are open on wide screens and closed on narrow ones;
 * the choice then sticks (and is remembered across visits).
 */
export function usePanels() {
  const narrow = useMedia(NARROW_QUERY);
  // The inspector needs more room than the drafts list: it opens by default from 80rem up.
  const compact = useMedia('(max-width: 79.99rem)');
  const storedDrafts = useUi((state) => state.draftsOpen);
  const storedInspector = useUi((state) => state.inspectorOpen);
  const setDraftsOpen = useUi((state) => state.setDraftsOpen);
  const setInspectorOpen = useUi((state) => state.setInspectorOpen);
  return {
    narrow,
    draftsOpen: storedDrafts ?? !narrow,
    inspectorOpen: storedInspector ?? !compact,
    setDraftsOpen,
    setInspectorOpen,
    closeAll() {
      setDraftsOpen(false);
      setInspectorOpen(false);
    },
  };
}
