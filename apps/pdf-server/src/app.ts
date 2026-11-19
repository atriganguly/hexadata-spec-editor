import { existsSync } from 'node:fs';
import Fastify, { type FastifyError, type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import { REQUEST_LIMITS } from '@hexadata/spec-core';
import { AssetStore } from './assets.ts';
import { BrowserPool } from './browser-pool.ts';
import { ConfigError, isOriginAllowed, type Config } from './config.ts';
import { HttpError, type ErrorCode } from './errors.ts';
import { slugify } from './metadata.ts';
import { readRenderRequest } from './request.ts';
import { renderPdf } from './render.ts';

export interface AppParts {
  app: FastifyInstance;
  pool: BrowserPool;
  assets: AssetStore;
}

/** Strict CSP for the JSON/PDF API; the web app (when served from here) needs same-origin script/style/img. */
function cspFor(config: Config): { useDefaults: false; directives: Record<string, string[]> } {
  if (!config.serveWeb) {
    return {
      useDefaults: false as const,
      directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] },
    };
  }
  return {
    useDefaults: false as const,
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'"],
      imgSrc: ["'self'", 'blob:', 'data:'],
      fontSrc: ["'self'"],
      connectSrc: ["'self'"],
      workerSrc: ["'self'", 'blob:'],
      manifestSrc: ["'self'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'none'"],
      frameAncestors: ["'none'"],
    },
  };
}

const FASTIFY_ERROR_MAP: Record<string, { status: number; code: ErrorCode; message: string }> = {
  FST_REQ_FILE_TOO_LARGE: {
    status: 413,
    code: 'PAYLOAD_TOO_LARGE',
    message: 'An image is larger than 5 MB.',
  },
  FST_FILES_LIMIT: { status: 413, code: 'PAYLOAD_TOO_LARGE', message: 'Too many images.' },
  FST_FIELDS_LIMIT: { status: 413, code: 'PAYLOAD_TOO_LARGE', message: 'Too many fields.' },
  FST_PARTS_LIMIT: { status: 413, code: 'PAYLOAD_TOO_LARGE', message: 'Too many parts.' },
  FST_ERR_CTP_BODY_TOO_LARGE: {
    status: 413,
    code: 'PAYLOAD_TOO_LARGE',
    message: 'The request is too large.',
  },
  FST_ERR_CTP_INVALID_MEDIA_TYPE: {
    status: 415,
    code: 'UNSUPPORTED_MEDIA_TYPE',
    message: 'Send multipart/form-data or application/json.',
  },
  FST_INVALID_MULTIPART_CONTENT_TYPE: {
    status: 415,
    code: 'UNSUPPORTED_MEDIA_TYPE',
    message: 'Send multipart/form-data or application/json.',
  },
  FST_ERR_CTP_INVALID_JSON_BODY: {
    status: 400,
    code: 'BAD_REQUEST',
    message: 'The body is not valid JSON.',
  },
  FST_ERR_CTP_EMPTY_JSON_BODY: { status: 400, code: 'BAD_REQUEST', message: 'The body is empty.' },
};

export async function buildApp(config: Config): Promise<AppParts> {
  const app = Fastify({
    logger: config.logLevel === 'silent' ? false : { level: config.logLevel },
    trustProxy:
      typeof config.trustProxy === 'number'
        ? (
            (hops: number) => (_address: string, hop: number) =>
              hop < hops
          )(config.trustProxy)
        : config.trustProxy,
    bodyLimit: REQUEST_LIMITS.documentJsonBytes,
    requestIdHeader: false,
    genReqId: () => crypto.randomUUID(),
    forceCloseConnections: 'idle',
  });

  if (config.serveWeb && (!config.webDist || !existsSync(config.webDist))) {
    throw new ConfigError(
      'SERVE_WEB=1 requires WEB_DIST to point at the built web app (apps/web/dist).',
    );
  }

  const assets = new AssetStore();
  const pool = new BrowserPool({
    concurrency: config.concurrency,
    queueMax: config.queueMax,
    recycleAfter: config.recycleAfter,
    noSandbox: config.chromeNoSandbox,
    log: {
      info: (msg) => app.log.info(msg),
      warn: (msg) => app.log.warn(msg),
      error: (err, msg) => app.log.error({ err }, msg),
    },
  });
  app.addHook('onClose', async () => {
    await pool.close();
  });

  await app.register(helmet, {
    contentSecurityPolicy: cspFor(config),
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    referrerPolicy: { policy: 'no-referrer' },
  });

  await app.register(cors, {
    origin: config.allowedOrigins,
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type'],
    exposedHeaders: ['Content-Disposition', 'X-Request-Id', 'X-Pdf-Pages', 'Retry-After'],
    maxAge: 600,
    credentials: false,
  });

  await app.register(rateLimit, {
    global: false,
    max: config.rateLimitMax,
    timeWindow: config.rateLimitWindowMs,
    errorResponseBuilder: (_req, context) =>
      new HttpError(429, 'RATE_LIMITED', 'Too many exports. Please wait a moment and try again.', {
        headers: { 'Retry-After': String(Math.ceil(context.ttl / 1000)) },
      }),
  });

  await app.register(multipart, { throwFileSizeLimit: true });

  // Browsers always send Origin on cross-origin POSTs: refuse those that are not on the allow-list.
  app.addHook('onRequest', async (req, reply) => {
    if (req.method === 'OPTIONS') return;
    if (!isOriginAllowed(req.headers.origin, req.headers.host, config)) {
      throw new HttpError(
        403,
        'ORIGIN_NOT_ALLOWED',
        'This origin is not allowed to use the PDF engine.',
      );
    }
    reply.header('X-Request-Id', req.id);
  });

  app.setErrorHandler((error: FastifyError | HttpError, req, reply) => {
    let status: number;
    let body: { code: ErrorCode; message: string; issues?: string[] };
    const headers: Record<string, string> = {};

    if (error instanceof HttpError) {
      status = error.status;
      body = {
        code: error.code,
        message: error.message,
        ...(error.issues ? { issues: error.issues } : {}),
      };
      Object.assign(headers, error.headers);
    } else if (
      'code' in error &&
      typeof error.code === 'string' &&
      error.code in FASTIFY_ERROR_MAP
    ) {
      const mapped = FASTIFY_ERROR_MAP[error.code]!;
      status = mapped.status;
      body = { code: mapped.code, message: mapped.message };
    } else if (
      'statusCode' in error &&
      error.statusCode &&
      error.statusCode >= 400 &&
      error.statusCode < 500
    ) {
      status = error.statusCode;
      body = { code: 'BAD_REQUEST', message: 'The request could not be processed.' };
    } else {
      req.log.error({ err: error }, 'Unhandled error');
      status = 500;
      body = { code: 'RENDER_FAILED', message: 'Something went wrong. Please try again.' };
    }
    void reply.headers(headers).code(status).send(body);
  });

  app.setNotFoundHandler((_req, reply) => {
    void reply.code(404).send({ code: 'NOT_FOUND', message: 'Not found.' });
  });

  /* ---------- Health ---------- */

  app.get('/healthz', { config: { rateLimit: false } }, async () => ({ status: 'ok' }));
  app.get('/readyz', { config: { rateLimit: false } }, async (_req, reply) => {
    if (!pool.isReady) {
      return reply.code(503).send({ status: 'starting', ...pool.stats });
    }
    return { status: 'ready', ...pool.stats };
  });

  /* ---------- Render ---------- */

  app.post(
    '/v1/render',
    { config: { rateLimit: { max: config.rateLimitMax, timeWindow: config.rateLimitWindowMs } } },
    async (req, reply) => {
      const request = await readRenderRequest(req);
      const result = await renderPdf(pool, assets, request, {
        timeoutMs: config.renderTimeoutMs,
        log: { warn: (obj, msg) => req.log.warn(obj, msg) },
      });
      const filename = `${slugify(result.title)}.pdf`;
      req.log.info(
        { ms: result.durationMs, bytes: result.pdf.byteLength, uploads: request.uploads.size },
        'Rendered PDF',
      );
      return reply
        .header('Content-Type', 'application/pdf')
        .header(
          'Content-Disposition',
          `attachment; filename="${filename}"; filename*=UTF-8''${filename}`,
        )
        .header('Cache-Control', 'no-store')
        .header('X-Pdf-Pages', String(result.pagesRendered))
        .send(Buffer.from(result.pdf));
    },
  );

  /* ---------- Web app (single-container mode) ---------- */

  if (config.serveWeb && config.webDist) {
    await app.register(fastifyStatic, {
      root: config.webDist,
      wildcard: true,
      index: 'index.html',
      setHeaders(res, path) {
        const immutable = /[\\/]assets[\\/]/.test(path);
        res.header('Cache-Control', immutable ? 'public, max-age=31536000, immutable' : 'no-cache');
      },
    });
  }

  return { app, pool, assets };
}
