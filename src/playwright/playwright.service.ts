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

  async onModuleInit(): Promise<void> {
    await this.getBrowser();
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

  private async launch(): Promise<Browser> {
    const bbKey = process.env.BROWSERBASE_API_KEY;
    const bbProject = process.env.BROWSERBASE_PROJECT_ID;

    let browser: Browser;
    if (bbKey && bbProject) {
      const bb = new Browserbase({ apiKey: bbKey });

      const contextId = process.env.BROWSERBASE_CONTEXT_ID;
      const sessionParams: SessionCreateParams = {
        projectId: bbProject,
        proxies: process.env.BROWSERBASE_PROXIES !== 'false',
      };

      if (contextId) {
        this.logger.log(`Reusing Browserbase context: ${contextId}`);
        sessionParams.browserSettings = {
          context: { id: contextId, persist: true },
        };
      } else {
        this.logger.log(
          'No BROWSERBASE_CONTEXT_ID set — running fresh session (no cookie/auth persistence)',
        );
      }

      const session = await bb.sessions.create(sessionParams);
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
