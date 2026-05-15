import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import {
  Browser,
  BrowserContext,
  chromium,
  LaunchOptions,
  Page,
} from 'playwright';
import Browserbase from '@browserbasehq/sdk';
import type { SessionCreateParams } from '@browserbasehq/sdk/resources/sessions/sessions';
import { SystemConfigService } from '../common/system-config/system-config.service';

const CONTEXT_KEY = 'browserbase_context_id';

@Injectable()
export class PlaywrightService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PlaywrightService.name);
  private readonly launchOptions: LaunchOptions = {
    headless: process.env.PLAYWRIGHT_HEADLESS !== 'false',
    slowMo: process.env.PLAYWRIGHT_SLOWMO
      ? Number(process.env.PLAYWRIGHT_SLOWMO)
      : undefined,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--start-maximized'],
    proxy: process.env.PLAYWRIGHT_PROXY_SERVER
      ? {
          server: process.env.PLAYWRIGHT_PROXY_SERVER,
          username: process.env.PLAYWRIGHT_PROXY_USERNAME || undefined,
          password: process.env.PLAYWRIGHT_PROXY_PASSWORD || undefined,
        }
      : undefined,
  };
  private browser?: Browser;
  private launching?: Promise<Browser>;
  private destroyed = false;
  private isCdpBrowser = false;

  constructor(private readonly systemConfig: SystemConfigService) {}

  async onModuleInit(): Promise<void> {
    await this.getBrowser();
  }

  /**
   * Public — admin can call this to rotate Browserbase context after stale auth.
   * Returns the new context id.
   */
  async rotateContext(): Promise<string> {
    const bbKey = process.env.BROWSERBASE_API_KEY;
    const bbProject = process.env.BROWSERBASE_PROJECT_ID;
    if (!bbKey || !bbProject) {
      throw new Error('Browserbase not configured');
    }
    const bb = new Browserbase({ apiKey: bbKey });
    const ctx = await bb.contexts.create({ projectId: bbProject });
    await this.systemConfig.set(CONTEXT_KEY, ctx.id);
    this.logger.warn(`Manually rotated Browserbase context → ${ctx.id}`);
    // Force next request to re-launch so the new context is picked up
    if (this.browser && this.browser.isConnected()) {
      await this.browser.close().catch(() => {});
    }
    this.browser = undefined;
    return ctx.id;
  }

  async onModuleDestroy(): Promise<void> {
    this.destroyed = true;
    if (this.browser && this.browser.isConnected()) {
      await this.browser.close();
      this.logger.log('Browser closed');
    }
    this.browser = undefined;
  }

  async withPage<T>(fn: (page: Page) => Promise<T>): Promise<T> {
    if (this.isCdpBrowser) {
      return this.withPageCdp(fn);
    }
    const context = await this.newContext();
    try {
      const page = await context.newPage();
      return await fn(page);
    } finally {
      await context.close();
    }
  }

  async newContext(): Promise<BrowserContext> {
    const browser = await this.getBrowser();
    return browser.newContext({ viewport: null });
  }

  private async withPageCdp<T>(fn: (page: Page) => Promise<T>): Promise<T> {
    const browser = await this.getBrowser();
    const context = browser.contexts()[0];
    if (!context) {
      throw new Error('CDP browser has no default context');
    }

    const page = await context.newPage();
    try {
      return await fn(page);
    } finally {
      await page.close().catch(() => {});
    }
  }

  private async getBrowser(): Promise<Browser> {
    if (this.destroyed) {
      throw new Error('PlaywrightService has been destroyed');
    }
    if (this.browser && this.browser.isConnected()) {
      return this.browser;
    }
    if (!this.launching) {
      this.launching = this.launch().finally(() => {
        this.launching = undefined;
      });
    }
    return this.launching;
  }

  /**
   * Create a Browserbase session, transparently rotating the context if the
   * stored ID is invalid (deleted, wrong project, etc).
   */
  private async createBrowserbaseSession(
    bb: Browserbase,
    bbProject: string,
  ) {
    let contextId =
      (await this.systemConfig.get(CONTEXT_KEY)) ??
      process.env.BROWSERBASE_CONTEXT_ID ??
      null;

    const buildParams = (id: string | null): SessionCreateParams => {
      const params: SessionCreateParams = {
        projectId: bbProject,
        proxies: process.env.BROWSERBASE_PROXIES !== 'false',
      };
      if (id) {
        params.browserSettings = { context: { id, persist: true } };
      }
      return params;
    };

    if (contextId) {
      this.logger.log(`Reusing Browserbase context: ${contextId}`);
    } else {
      this.logger.log(
        'No Browserbase context configured — running fresh session',
      );
    }

    try {
      return await bb.sessions.create(buildParams(contextId));
    } catch (err) {
      if (!contextId || !this.isInvalidContextError(err)) {
        throw err;
      }
      this.logger.warn(
        `Stored Browserbase context ${contextId} is invalid (${(err as Error).message}). Creating a fresh one.`,
      );
      const fresh = await bb.contexts.create({ projectId: bbProject });
      await this.systemConfig.set(CONTEXT_KEY, fresh.id);
      this.logger.log(`Rotated Browserbase context → ${fresh.id}`);
      return bb.sessions.create(buildParams(fresh.id));
    }
  }

  private isInvalidContextError(err: unknown): boolean {
    const msg = err instanceof Error ? err.message.toLowerCase() : String(err);
    return (
      /context.*(not found|invalid|does not exist|404)/i.test(msg) ||
      /400|404/.test(msg)
    );
  }

  private async launch(): Promise<Browser> {
    const bbKey = process.env.BROWSERBASE_API_KEY;
    const bbProject = process.env.BROWSERBASE_PROJECT_ID;

    let browser: Browser;
    if (bbKey && bbProject) {
      const bb = new Browserbase({ apiKey: bbKey });
      const session = await this.createBrowserbaseSession(bb, bbProject);
      this.logger.log(`Browserbase session created: ${session.id}`);
      this.logger.log(
        `Live view: https://www.browserbase.com/sessions/${session.id}`,
      );
      browser = await chromium.connectOverCDP(session.connectUrl);
      this.isCdpBrowser = true;
    } else {
      browser = await chromium.launch(this.launchOptions);
      this.isCdpBrowser = false;
    }

    browser.on('disconnected', () => {
      this.logger.warn('Browser disconnected');
      if (this.browser === browser) {
        this.browser = undefined;
      }
    });
    this.browser = browser;
    this.logger.log(
      this.isCdpBrowser
        ? 'Connected to Browserbase'
        : 'Chromium launched locally',
    );
    return browser;
  }
}
