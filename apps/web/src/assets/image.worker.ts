/// <reference lib="webworker" />
import {
  ImageRejected,
  processWith,
  type Encoder,
  type ImageTarget,
  type ProcessedImage,
} from './image-core.ts';

/** Image decoding and re-encoding off the main thread, so large photos never freeze the editor. */
const encoder: Encoder = {
  async encode(bitmap, width, height, quality) {
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas is not available.');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bitmap, 0, 0, width, height);
    return canvas.convertToBlob({ type: 'image/webp', quality });
  },
};

export interface WorkerRequest {
  id: number;
  file: Blob;
  target: ImageTarget;
}
export type WorkerResponse =
  | { id: number; ok: true; image: ProcessedImage }
  | { id: number; ok: false; message: string; rejected: boolean };

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const { id, file, target } = event.data;
  try {
    const image = await processWith(file, target, (blob) => createImageBitmap(blob), encoder);
    (self as unknown as Worker).postMessage({ id, ok: true, image } satisfies WorkerResponse);
  } catch (error) {
    (self as unknown as Worker).postMessage({
      id,
      ok: false,
      message: error instanceof Error ? error.message : 'Image processing failed.',
      rejected: error instanceof ImageRejected,
    } satisfies WorkerResponse);
  }
};
