import {
  ImageRejected,
  processWith,
  type Encoder,
  type ImageTarget,
  type ProcessedImage,
} from './image-core.ts';
import type { WorkerRequest, WorkerResponse } from './image.worker.ts';

export { ImageRejected, type ImageTarget, type ProcessedImage } from './image-core.ts';

let worker: Worker | undefined;
let nextId = 1;
const pending = new Map<
  number,
  { resolve(image: ProcessedImage): void; reject(error: Error): void }
>();

function getWorker(): Worker {
  if (worker) return worker;
  worker = new Worker(new URL('./image.worker.ts', import.meta.url), { type: 'module' });
  worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
    const entry = pending.get(event.data.id);
    if (!entry) return;
    pending.delete(event.data.id);
    if (event.data.ok) entry.resolve(event.data.image);
    else
      entry.reject(
        event.data.rejected ? new ImageRejected(event.data.message) : new Error(event.data.message),
      );
  };
  worker.onerror = () => {
    for (const entry of pending.values())
      entry.reject(new Error('The image worker stopped unexpectedly.'));
    pending.clear();
    worker?.terminate();
    worker = undefined;
  };
  return worker;
}

/** Main-thread fallback for browsers without OffscreenCanvas / module workers. */
const domEncoder: Encoder = {
  async encode(bitmap, width, height, quality) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas is not available.');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bitmap, 0, 0, width, height);
    return new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('Could not encode the image.'))),
        'image/webp',
        quality,
      );
    });
  },
};

const canUseWorker = () =>
  typeof Worker !== 'undefined' &&
  typeof OffscreenCanvas !== 'undefined' &&
  typeof createImageBitmap === 'function';

/**
 * Validates, downscales and re-encodes an image the user picked. The result is small, WebP (or PNG where the
 * browser cannot encode WebP) and content-addressed by its SHA-256, ready to store and to upload for export.
 * Throws `ImageRejected` with a user-readable message for files that are not usable.
 */
export async function processImage(file: Blob, target: ImageTarget): Promise<ProcessedImage> {
  if (canUseWorker()) {
    return new Promise<ProcessedImage>((resolve, reject) => {
      const id = nextId++;
      pending.set(id, { resolve, reject });
      getWorker().postMessage({ id, file, target } satisfies WorkerRequest);
    });
  }
  return processWith(file, target, (blob) => createImageBitmap(blob), domEncoder);
}
