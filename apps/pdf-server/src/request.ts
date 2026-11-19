import { createHash } from 'node:crypto';
import type { FastifyRequest } from 'fastify';
import {
  checkImage,
  migrateDocument,
  REQUEST_LIMITS,
  type AssetRef,
  type SpecDocument,
} from '@hexadata/spec-core';
import { HttpError } from './errors.ts';
import type { Upload } from './render.ts';

export interface ParsedRenderRequest {
  document: SpecDocument;
  uploads: Map<AssetRef, Upload>;
}

const ASSET_KEY = /^asset:([a-f0-9]{64})$/;

/**
 * Reads and validates a render request. Two shapes are accepted:
 *  - `multipart/form-data`: a `document` text field (JSON) plus one file part per user image, each named by
 *    its `asset:<sha256>` reference;
 *  - `application/json`: the document itself (only usable when it references no uploaded images).
 *
 * Every limit is enforced while streaming, and every upload is verified (content hash, real image type,
 * pixel size) before it can reach the browser.
 */
export async function readRenderRequest(req: FastifyRequest): Promise<ParsedRenderRequest> {
  let json: unknown;
  const uploads = new Map<AssetRef, Upload>();

  if (req.isMultipart()) {
    let documentText: string | undefined;
    let total = 0;
    for await (const part of req.parts({
      limits: {
        fileSize: REQUEST_LIMITS.fileBytes,
        files: REQUEST_LIMITS.files,
        fields: 4,
        fieldSize: REQUEST_LIMITS.documentJsonBytes,
        parts: REQUEST_LIMITS.files + 4,
      },
    })) {
      if (part.type === 'field') {
        if (part.fieldname !== 'document') {
          throw new HttpError(400, 'BAD_REQUEST', `Unexpected field "${part.fieldname}".`);
        }
        if (typeof part.value !== 'string' || documentText !== undefined) {
          throw new HttpError(400, 'BAD_REQUEST', 'Send exactly one "document" text field.');
        }
        documentText = part.value;
        continue;
      }

      const key = ASSET_KEY.exec(part.fieldname);
      if (!key) {
        throw new HttpError(
          400,
          'BAD_REQUEST',
          'File parts must be named by their asset reference.',
        );
      }
      const ref = part.fieldname as AssetRef;
      if (uploads.has(ref)) throw new HttpError(400, 'BAD_REQUEST', `Duplicate upload "${ref}".`);

      const bytes = await part.toBuffer(); // enforces the per-file limit
      total += bytes.byteLength;
      if (total > REQUEST_LIMITS.totalBytes) {
        throw new HttpError(413, 'PAYLOAD_TOO_LARGE', 'The upload is too large.');
      }
      const hash = createHash('sha256').update(bytes).digest('hex');
      if (hash !== key[1]) {
        throw new HttpError(422, 'INVALID_ASSET', `Image "${ref}" does not match its checksum.`);
      }
      const checked = checkImage(bytes);
      if (!checked.ok) throw new HttpError(422, 'INVALID_ASSET', checked.reason);
      uploads.set(ref, { bytes, mime: checked.info.mime });
    }

    if (documentText === undefined)
      throw new HttpError(400, 'BAD_REQUEST', 'Missing "document" field.');
    try {
      json = JSON.parse(documentText);
    } catch {
      throw new HttpError(400, 'BAD_REQUEST', 'The document is not valid JSON.');
    }
  } else {
    if (!req.headers['content-type']?.toLowerCase().startsWith('application/json')) {
      throw new HttpError(
        415,
        'UNSUPPORTED_MEDIA_TYPE',
        'Send multipart/form-data or application/json.',
      );
    }
    json = req.body;
  }

  const parsed = migrateDocument(json);
  if (!parsed.ok) {
    throw new HttpError(422, 'INVALID_DOCUMENT', 'The document is not valid.', {
      issues: parsed.issues,
    });
  }
  return { document: parsed.value, uploads };
}
