import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { existsSync, readFileSync } from 'fs';
import {
  Browser,
  BrowserContext,
  BrowserContextOptions,
  chromium,
  LaunchOptions,
  Page,
} from 'playwright';
import Browserbase from '@browserbasehq/sdk';

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

  async withPage<T>(
    fn: (page: Page) => Promise<T>,
    options: { storageState?: string } = {},
  ): Promise<T> {
    if (this.isCdpBrowser) {
      return this.withPageCdp(fn, options);
    }
    const context = await this.newContext(options);
    try {
      const page = await context.newPage();
      return await fn(page);
    } finally {
      await context.close();
    }
  }

  async newContext(
    options: { storageState?: string } = {},
  ): Promise<BrowserContext> {
    const browser = await this.getBrowser();
    const contextOptions: BrowserContextOptions = { viewport: null };
    if (options.storageState && existsSync(options.storageState)) {
      contextOptions.storageState = options.storageState;
    }
    return browser.newContext(contextOptions);
  }

  private async withPageCdp<T>(
    fn: (page: Page) => Promise<T>,
    options: { storageState?: string },
  ): Promise<T> {
    const browser = await this.getBrowser();
    const context = browser.contexts()[0];
    if (!context) {
      throw new Error('CDP browser has no default context');
    }

    if (options.storageState && existsSync(options.storageState)) {
      const state = JSON.parse(readFileSync(options.storageState, 'utf-8'));
      if (Array.isArray(state.cookies) && state.cookies.length > 0) {
        await context.addCookies(state.cookies);
      }
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
      const session = await bb.sessions.create({
        projectId: bbProject,
        proxies: process.env.BROWSERBASE_PROXIES !== 'false',
      });
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
