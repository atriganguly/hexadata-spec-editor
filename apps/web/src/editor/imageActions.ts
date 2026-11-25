import { LIMITS } from '@hexadata/spec-core';
import { getTemplateMeta } from '@hexadata/spec-templates';
import { runtime } from '../app/runtime.ts';
import { ImageRejected, processImage } from '../assets/pipeline.ts';
import { useDoc } from '../store/doc.ts';
import { useUi } from '../store/ui.ts';

export type ImageTargetRef =
  { kind: 'product' } | { kind: 'logo'; id: string } | { kind: 'new-logo' };

export const IMAGE_ACCEPT = 'image/png,image/jpeg,image/webp,image/gif,image/avif,image/bmp';

/** Opens the system file picker. Must be called from a user gesture (click, key press). */
export function pickImageFile(): Promise<File | undefined> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = IMAGE_ACCEPT;
    input.onchange = () => resolve(input.files?.[0] ?? undefined);
    input.oncancel = () => resolve(undefined);
    input.click();
  });
}

/**
 * Processes an image (validate, downscale, re-encode, hash), stores it content-addressed in IndexedDB and points
 * the chosen slot at it. Failures become a readable notification; the document is left untouched.
 */
export async function applyImageFile(file: Blob, target: ImageTargetRef): Promise<boolean> {
  const ui = useUi.getState();
  const doc = useDoc.getState();
  const meta = getTemplateMeta(doc.templateId ?? 'classic', doc.templateVersion);
  if (!meta) return false;
  const spec =
    target.kind === 'product' ? meta.imageSlots.productImage : meta.imageSlots.partnerLogo;

  try {
    ui.announce('Processing image…');
    const image = await processImage(file, spec);
    const { store, assets } = runtime();
    await store.putAsset({
      hash: image.hash,
      blob: image.blob,
      mime: image.mime,
      width: image.width,
      height: image.height,
      bytes: image.bytes,
      createdAt: Date.now(),
      thumb: image.thumb,
    });
    assets.add(image.hash, image.blob);
    const ref = `asset:${image.hash}` as const;
    if (target.kind === 'product') doc.setProductImage(ref);
    else if (target.kind === 'logo') doc.replacePartnerLogo(target.id, ref);
    else if (!doc.addPartnerLogo(ref)) {
      ui.toast(`A sheet can hold up to ${LIMITS.partnerLogos} partner logos.`, { tone: 'warning' });
      return false;
    }
    ui.announce('Image updated.');
    return true;
  } catch (error) {
    const message =
      error instanceof ImageRejected
        ? error.message
        : 'That image could not be processed. Try a PNG, JPEG or WebP file.';
    ui.toast(message, { tone: 'danger' });
    return false;
  }
}

/** Pick a file, then apply it. */
export async function chooseAndApplyImage(target: ImageTargetRef): Promise<void> {
  const file = await pickImageFile();
  if (file) await applyImageFile(file, target);
}
