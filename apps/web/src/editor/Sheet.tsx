import { useMemo, type ReactElement } from 'react';
import { SheetProvider, StaticTextCell, type LoadedTemplate } from '@hexadata/spec-templates';
import { createEditorUrls } from '../assets/builtin.ts';
import { useAssetVersion } from '../assets/asset-cache.ts';
import { runtime } from '../app/runtime.ts';
import { useSession } from '../drafts/session.ts';
import { useDoc } from '../store/doc.ts';
import { EditableTextCell } from './EditableTextCell.tsx';

/**
 * The template, rendered in edit mode. This is the same component tree the PDF renderer uses in print mode:
 * the editor adds editable text cells and data attributes, nothing else.
 */
export function Sheet({ template }: { template: LoadedTemplate }): ReactElement {
  const content = useDoc((state) => state.content);
  const readOnly = useSession((state) => state.readOnly);
  const assetVersion = useAssetVersion((state) => state.version);

  const value = useMemo(
    () => ({
      content,
      mode: 'edit' as const,
      // `version` changes when an uploaded image finishes loading, which gives the slots new URLs to render.
      urls: { ...createEditorUrls(runtime().assets.urlFor), version: assetVersion },
      TextCell: readOnly ? StaticTextCell : EditableTextCell,
    }),
    [content, readOnly, assetVersion],
  );

  const { Component } = template;
  return (
    <SheetProvider value={value}>
      <Component />
    </SheetProvider>
  );
}
