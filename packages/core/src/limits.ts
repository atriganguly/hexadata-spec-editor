/**
 * Hard limits shared by the editor (UI), draft import and the PDF server (request validation).
 * Raising a limit is a content-model change: bump the schema version if stored data could change shape.
 */
export const LIMITS = {
  draftName: 120,

  headerTitle: 120,
  title: 200,
  subtitle: 300,

  keyFeatures: 24,
  featureText: 300,
  applications: 1200,

  columns: 2,
  rowsPerColumn: 40,
  rowLabel: 120,
  rowValue: 1200,

  footerUrl: 200,
  footerDisclaimer: 600,
  footerCopyright: 300,

  partnerLogos: 4,

  /** Structural caps for any rich text field (defence in depth against pathological input). */
  linesPerField: 60,
  runsPerLine: 48,

  extrasEntries: 32,
  extrasKey: 64,
  extrasString: 1000,
} as const;

/** Upload and request limits for raster images. */
export const IMAGE_LIMITS = {
  /** Largest file the editor accepts before downscaling. */
  inputBytes: 25 * 1024 * 1024,
  /** Largest stored/uploaded image (after the editor's downscale). */
  storedBytes: 5 * 1024 * 1024,
  /** Pixel density the editor downscales to for print. */
  targetDpi: 300,
  maxEdgePx: 4096,
  /** Decompression-bomb guard: width x height. */
  maxPixels: 16_000_000,
  mimeTypes: ['image/png', 'image/jpeg', 'image/webp'] as const,
} as const;

/** Server request caps. */
export const REQUEST_LIMITS = {
  documentJsonBytes: 256 * 1024,
  files: 8,
  fileBytes: IMAGE_LIMITS.storedBytes,
  totalBytes: 20 * 1024 * 1024,
} as const;
