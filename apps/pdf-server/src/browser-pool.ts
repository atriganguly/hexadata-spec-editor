import puppeteer, { type Browser, type BrowserContext } from 'puppeteer';
import { busy } from './errors.ts';

export interface PoolOptions {
  concurrency: number;
  queueMax: number;
  recycleAfter: number;
  noSandbox: boolean;
  log?: {
    info(msg: string): void;
    warn(msg: string): void;
    error(err: unknown, msg: string): void;
  };
}

/**
 * One shared headless browser with bounded concurrency.
 *
 * - The browser is launched lazily (and at boot via `warm()`), reused for every render and relaunched when it
 *   dies or after `recycleAfter` renders, so a slow Chrome leak cannot accumulate.
 * - At most `concurrency` renders run at once; at most `queueMax` more wait. Anything beyond that is rejected
 *   immediately with 503 instead of piling up memory.
 * - Every render gets its own incognito-style browser context, closed afterwards, so no state leaks between
 *   requests.
 */
export class BrowserPool {
  private browser: Browser | undefined;
  private launching: Promise<Browser> | undefined;
  private active = 0;
  private rendersSinceLaunch = 0;
  private closed = false;
  private readonly waiters: Array<{ resolve: () => void; reject: (error: unknown) => void }> = [];

  constructor(private readonly options: PoolOptions) {}

  get isReady(): boolean {
    return !this.closed && this.browser?.connected === true;
  }

  get stats() {
    return {
      active: this.active,
      queued: this.waiters.length,
      rendersSinceLaunch: this.rendersSinceLaunch,
    };
  }

  /** Launch ahead of the first request. Never throws; readiness reports the result. */
  async warm(): Promise<void> {
    try {
      await this.getBrowser();
    } catch (error) {
      this.options.log?.error(error, 'Browser warm-up failed');
    }
  }

  /** Runs `task` inside a fresh browser context, honouring the concurrency and queue limits. */
  async run<T>(task: (context: BrowserContext) => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      const browser = await this.getBrowser();
      const context = await browser.createBrowserContext();
      try {
        return await task(context);
      } finally {
        await context.close().catch(() => undefined);
      }
    } finally {
      this.release();
    }
  }

  async close(): Promise<void> {
    this.closed = true;
    for (const waiter of this.waiters.splice(0))
      waiter.reject(busy('The PDF engine is shutting down.'));
    const browser = this.browser ?? (await this.launching?.catch(() => undefined));
    this.browser = undefined;
    this.launching = undefined;
    await browser?.close().catch(() => undefined);
  }

  private acquire(): Promise<void> {
    if (this.closed) return Promise.reject(busy('The PDF engine is shutting down.'));
    if (this.active < this.options.concurrency) {
      this.active += 1;
      return Promise.resolve();
    }
    if (this.waiters.length >= this.options.queueMax) return Promise.reject(busy());
    return new Promise<void>((resolve, reject) => {
      this.waiters.push({ resolve: () => resolve(), reject });
    });
  }

  private release(): void {
    this.rendersSinceLaunch += 1;
    const next = this.waiters.shift();
    if (next) {
      next.resolve(); // hand the slot over: `active` stays the same
      return;
    }
    this.active -= 1;
    if (this.active === 0 && this.rendersSinceLaunch >= this.options.recycleAfter) this.recycle();
  }

  private recycle(): void {
    const browser = this.browser;
    this.browser = undefined;
    this.rendersSinceLaunch = 0;
    this.options.log?.info('Recycling browser');
    void browser?.close().catch(() => undefined);
  }

  private async getBrowser(): Promise<Browser> {
    if (this.browser?.connected) return this.browser;
    this.launching ??= this.launch().finally(() => {
      this.launching = undefined;
    });
    return this.launching;
  }

  private async launch(): Promise<Browser> {
    const args = [
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--disable-extensions',
      '--disable-background-networking',
      '--disable-component-update',
      '--no-first-run',
      '--mute-audio',
      '--hide-scrollbars',
      '--font-render-hinting=none',
    ];
    if (this.options.noSandbox)
      args.push('--no-sandbox', '--disable-setuid-sandbox', '--no-zygote');

    const browser = await puppeteer.launch({
      headless: 'shell',
      args,
      // The server owns shutdown (drains renders first); puppeteer must not kill Chrome on a signal.
      handleSIGINT: false,
      handleSIGTERM: false,
      handleSIGHUP: false,
      protocolTimeout: 30_000,
    });
    browser.on('disconnected', () => {
      if (this.browser === browser) this.browser = undefined;
      if (!this.closed)
        this.options.log?.warn('Browser disconnected; it will be relaunched on demand');
    });
    this.browser = browser;
    this.rendersSinceLaunch = 0;
    return browser;
  }
}
