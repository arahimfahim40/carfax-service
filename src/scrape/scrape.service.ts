import {
  Injectable,
  InternalServerErrorException,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { mkdir, writeFile } from 'fs/promises';
import { resolve } from 'path';
import { Page } from 'playwright';
import { PlaywrightService } from '../playwright/playwright.service';
import { MfaCodeService } from './mfa-code.service';
import { VhrReportService } from '../vhr-report/vhr-report.service';

const CARFAX_ONLINE_URL = 'https://www.carfaxonline.com/login';
const REPORTS_DIR = resolve(process.cwd(), '.reports');
const VHR_API = (vin: string, api: boolean) => api ? `https://www.carfaxonline.com/vhr/${vin}` : `https://dealers.carfax.com/api/vhr/${vin}`;

@Injectable()
export class ScrapeService {
  private readonly logger = new Logger(ScrapeService.name);

  constructor(
    private readonly playwright: PlaywrightService,
    private readonly mfaCodeService: MfaCodeService,
    private readonly vhrReports: VhrReportService,
  ) { }

  async openCarfaxOnline(vin?: string) {
    if (vin) {
      const cached = await this.vhrReports.findLatestByVin(vin);
      if (cached) {
        const key = this.vhrReports.extractKeyFromUrl(cached.pdf_url);
        const downloadUrl = key
          ? await this.vhrReports.getDownloadUrl(key)
          : null;
        this.logger.log(`Cache hit for vin=${vin} (vhrReportId=${cached.id})`);
        return {
          url: null,
          status: null,
          title: null,
          loggedIn: null,
          usedExistingSession: null,
          vin,
          reportPath: null,
          reportPdfPath: null,
          reportPdfUrl: cached.pdf_url,
          reportPdfKey: key,
          reportPdfDownloadUrl: downloadUrl,
          vhrReportId: cached.id,
          report: cached.json_payload,
          usedCachedReport: true,
        };
      }
    }

    return this.playwright.withPage(
      async (page) => {
        this.logger.log(
          `Opening ${CARFAX_ONLINE_URL}${vin ? ` (vin=${vin})` : ''}`,
        );

        const response = await page.goto(CARFAX_ONLINE_URL, {
          waitUntil: 'domcontentloaded',
          timeout: 65_000,
        });

        // Wait for any auth redirect chain to settle before checking the URL
        await page
          .waitForLoadState('networkidle', { timeout: 15_000 })
          .catch(() => { });

        let didLogin = false;
        if (this.isOnLoginPage(page)) {
          await this.login(page);
          didLogin = true;
        }

        let report: unknown = null;
        let reportPath: string | null = null;
        let reportPdfPath: string | null = null;
        let reportPdfUrl: string | null = null;
        let reportPdfKey: string | null = null;
        let reportPdfDownloadUrl: string | null = null;
        let vhrReportId: number | null = null;
        if (vin && !this.isOnLoginPage(page)) {
          const fetched = await this.fetchVhrReport(page, vin);
          report = fetched.data;
          reportPath = fetched.savedPath;
          if (fetched.savedPath) {
            reportPdfPath = await this.saveReportPdf(page, vin);
            if (reportPdfPath) {
              const { row, uploaded } = await this.vhrReports.create({
                vin,
                jsonPayload: report,
                pdfFilePath: reportPdfPath,
              });
              vhrReportId = row.id;
              reportPdfUrl = uploaded.url;
              reportPdfKey = uploaded.key;
              reportPdfDownloadUrl = await this.vhrReports.getDownloadUrl(
                uploaded.key,
              );
            }
          }
        }

        const holdMs = Number(process.env.PLAYWRIGHT_HOLD_MS ?? 0);
        if (holdMs > 0) {
          await page.waitForTimeout(holdMs);
        }

        return {
          url: page.url(),
          status: response?.status() ?? null,
          title: await page.title(),
          loggedIn: !this.isOnLoginPage(page),
          usedExistingSession: !didLogin,
          vin: vin ?? null,
          reportPath,
          reportPdfPath,
          reportPdfUrl,
          reportPdfKey,
          reportPdfDownloadUrl,
          vhrReportId,
          report,
          usedCachedReport: false,
        };
      },
    );
  }

  private isOnLoginPage(page: Page): boolean {
    const url = page.url();
    return (
      url.includes('auth.carfax.com') ||
      url.includes('carfaxonline.com/login')
    );
  }

  private async login(page: Page): Promise<void> {
    const username = process.env.CARFAX_USERNAME;
    const password = process.env.CARFAX_PASSWORD;
    console.log(username, password)

    if (!username || !password) {
      throw new InternalServerErrorException(
        'CARFAX_USERNAME / CARFAX_PASSWORD are not set in .env',
      );
    }

    const emailInput = page
      .locator('input[name="username"]:not([readonly])')
      .first();
    const passwordInput = page
      .locator('input[name="password"]:not(.hide)')
      .first();

    const emailVisible = await emailInput
      .isVisible({ timeout: 5_000 })
      .catch(() => false);

    this.logger.log(
      `Login start: URL=${page.url()}, emailVisible=${emailVisible}`,
    );

    if (emailVisible) {
      this.logger.log('Login step 1/2: submitting email');
      await emailInput.fill(username);
      await page.locator('button[type="submit"]').first().click();

      try {
        await passwordInput.waitFor({ state: 'visible', timeout: 20_000 });
      } catch {
        const errorText = await page
          .locator('.ulp-input-error-message, .ulp-error-info:not(.aria-error-check)')
          .first()
          .textContent()
          .catch(() => null);
        throw new UnauthorizedException(
          errorText?.trim() ||
            `Stuck on email step. URL=${page.url()} title="${await page.title()}"`,
        );
      }
    }

    // Verify password field is reachable before fill — better error than a raw timeout
    const passwordVisible = await passwordInput
      .isVisible({ timeout: 5_000 })
      .catch(() => false);

    if (!passwordVisible) {
      const visibleText = await page
        .locator('body')
        .innerText()
        .catch(() => '')
        .then((t) => t.slice(0, 400));
      throw new UnauthorizedException(
        `No password field visible. URL=${page.url()} title="${await page.title()}". ` +
          `Page text: ${visibleText.replace(/\s+/g, ' ')}`,
      );
    }

    this.logger.log('Login step 2/2: submitting password');
    await passwordInput.fill(password);
    await page.locator('button[type="submit"]').first().click();

    const mfaTimeoutMs = Number(process.env.CARFAX_MFA_TIMEOUT_MS ?? 300_000);

    try {
      await page.waitForURL((u) => !u.toString().includes('auth.carfax.com'), {
        timeout: 15_000,
      });
    } catch {
      const passwordError = await page
        .locator('#error-element-password')
        .first()
        .textContent()
        .catch(() => null);
      if (passwordError?.trim()) {
        throw new UnauthorizedException(passwordError.trim());
      }

      await this.switchMfaToEmail(page);

      this.logger.warn(
        `MFA challenge: waiting for code from n8n (or manual entry) — up to ${mfaTimeoutMs / 1000}s...`,
      );

      // Try to receive the code from n8n and type it; fall back to manual entry
      try {
        const code = await this.mfaCodeService.waitForCode(mfaTimeoutMs);
        await page
          .locator(
            'input[name="code"], input[autocomplete="one-time-code"], input[inputmode="numeric"]',
          )
          .first()
          .fill(code);
        await page.locator('button[type="submit"]').first().click();
        this.logger.log('MFA: code submitted from n8n');
      } catch (err) {
        this.logger.warn(
          `MFA: did not receive code from n8n (${(err as Error).message}) — finish in the browser window`,
        );
      }

      try {
        await page.waitForURL(
          (u) => !u.toString().includes('auth.carfax.com'),
          { timeout: mfaTimeoutMs },
        );
      } catch {
        throw new UnauthorizedException(
          'Carfax MFA not completed in time. Re-trigger the request and finish MFA.',
        );
      }
    }

    this.logger.log(`Login complete, landed on ${page.url()}`);
  }

  private async switchMfaToEmail(page: Page): Promise<void> {
    if (page.url().includes('/u/mfa-email-challenge')) {
      this.logger.log('MFA: already on email challenge');
      return;
    }
console.log("MFA change to email")

    // Step 1: click "Try another method" and wait for the URL to change
    const tryAnotherBtn = page
      .locator('button[value="pick-authenticator"]')
      .first();
    try {
      await tryAnotherBtn.waitFor({ state: 'visible', timeout: 10_000 });
    } catch {
      this.logger.warn('MFA: "Try another method" button not visible');
      return;
    }

    const startUrl = page.url();
    await Promise.all([
      page
        .waitForURL((u) => u.toString() !== startUrl, { timeout: 15_000 })
        .catch(() => { }),
      tryAnotherBtn.click(),
    ]);
    await page
      .waitForLoadState('networkidle', { timeout: 5_000 })
      .catch(() => { });

    if (page.url() === startUrl) {
      this.logger.warn(
        `MFA: URL did not change after "Try another method" — still on ${startUrl}`,
      );
      return;
    }
    this.logger.log(`MFA: now on authenticator picker (${page.url()})`);

    // Step 2: click the Email option (use accessible name first, fall back to selectors)
    const emailButton = page
      .locator(
        'form.ulp-action-form-email button[type="submit"], button[aria-label="Email"], button[value^="email"]',
      )
      .or(page.getByRole('button', { name: /^email/i }))
      .first();

    try {
      await emailButton.waitFor({ state: 'visible', timeout: 15_000 });
    } catch {
      this.logger.warn(
        `MFA: email button not visible at ${page.url()} — pick Email manually`,
      );
      return;
    }

    await emailButton.click();
    this.logger.log('MFA: clicked Email option');

    try {
      await page.waitForURL(/\/u\/mfa-email-challenge/, { timeout: 15_000 });
      this.logger.log('MFA: email challenge page reached, code sent to inbox');
    } catch {
      this.logger.warn(
        'MFA: did not reach email challenge page — check the browser window',
      );
    }
  }

  private async fetchVhrReport(
    page: Page,
    vin: string,
  ): Promise<{ data: unknown; savedPath: string | null }> {
    const uiUrl = VHR_API(vin, true);
    const apiUrl = VHR_API(vin, false);
    const captchaTimeoutMs = Number(
      process.env.DATADOME_CAPTCHA_TIMEOUT_MS ?? 300_000,
    );

    this.logger.log(`Opening UI ${uiUrl}, capturing API ${apiUrl}`);

    let attempt = await this.attemptVhrCapture(page, uiUrl, apiUrl);

    if (this.isDatadomeBlocked(attempt)) {
      this.logger.warn(
        `*** Datadome CAPTCHA detected ***\n` +
          `Solve the puzzle in the visible browser window.\n` +
          `Waiting up to ${captchaTimeoutMs / 1000}s for the datadome cookie to update...`,
      );
      const solved = await this.waitForDatadomeCookieChange(
        page,
        captchaTimeoutMs,
      );
      if (solved) {
        this.logger.log('Datadome cookie updated — retrying VHR');
        attempt = await this.attemptVhrCapture(page, uiUrl, apiUrl);
      } else {
        this.logger.warn('Datadome cookie did not update within timeout');
      }
    }

    const captured = attempt.response;
    if (!captured) {
      return {
        data: {
          ok: false,
          status: 0,
          body: attempt.error ?? 'No API response captured',
        },
        savedPath: null,
      };
    }

    if (captured.status < 200 || captured.status >= 300) {
      this.logger.warn(`VHR fetch failed: ${captured.status}`);
      return {
        data: {
          ok: false,
          status: captured.status,
          body: captured.body.slice(0, 500),
        },
        savedPath: null,
      };
    }

    let data: unknown;
    try {
      data = JSON.parse(captured.body);
    } catch {
      this.logger.warn('VHR response was not JSON. Saving raw.');
      data = captured.body;
    }

    const savedPath = await this.saveReport(vin, data);
    return { data, savedPath };
  }

  private async attemptVhrCapture(
    page: Page,
    uiUrl: string,
    apiUrl: string,
  ): Promise<{
    response: { status: number; body: string } | null;
    error?: string;
  }> {
    const apiResponsePromise = page
      .waitForResponse(
        (r) => r.url().startsWith(apiUrl) && r.request().method() === 'GET',
        { timeout: 45_000 },
      )
      .catch(() => null);

    await page
      .goto(uiUrl, { waitUntil: 'domcontentloaded', timeout: 45_000 })
      .catch(() => {});

    const apiResponse = await apiResponsePromise;
    if (!apiResponse) return { response: null, error: 'API call not observed' };
    return {
      response: {
        status: apiResponse.status(),
        body: await apiResponse.text(),
      },
    };
  }

  private isDatadomeBlocked(attempt: {
    response: { status: number; body: string } | null;
  }): boolean {
    return (
      attempt.response?.status === 403 &&
      attempt.response.body.includes('captcha-delivery')
    );
  }

  private async waitForDatadomeCookieChange(
    page: Page,
    timeoutMs: number,
  ): Promise<boolean> {
    const initial = await this.getDatadomeCookie(page);
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      await page.waitForTimeout(2_000);
      const current = await this.getDatadomeCookie(page);
      if (current && current !== initial) return true;
    }
    return false;
  }

  private async getDatadomeCookie(page: Page): Promise<string | null> {
    const cookies = await page.context().cookies();
    return cookies.find((c) => c.name === 'datadome')?.value ?? null;
  }

  private async saveReport(vin: string, data: unknown): Promise<string> {
    await mkdir(REPORTS_DIR, { recursive: true });
    const path = resolve(REPORTS_DIR, `${vin}.json`);
    const body =
      typeof data === 'string' ? data : JSON.stringify(data, null, 2);
    await writeFile(path, body);
    this.logger.log(`Report saved to ${path}`);
    return path;
  }

  private async saveReportPdf(
    page: Page,
    vin: string,
  ): Promise<string | null> {
    try {
      // Wait for the report UI to finish rendering its data
      await page
        .waitForLoadState('networkidle', { timeout: 30_000 })
        .catch(() => {});

      // Force print-friendly CSS so the PDF matches the printable view
      await page.emulateMedia({ media: 'print' }).catch(() => {});

      await mkdir(REPORTS_DIR, { recursive: true });
      const path = resolve(REPORTS_DIR, `${vin}.pdf`);

      await page.pdf({
        path,
        format: 'Letter',
        printBackground: true,
        preferCSSPageSize: true,
        margin: {
          top: '0.4in',
          bottom: '0.4in',
          left: '0.4in',
          right: '0.4in',
        },
      });

      this.logger.log(`PDF saved to ${path}`);
      return path;
    } catch (err) {
      this.logger.warn(`PDF generation failed: ${(err as Error).message}`);
      return null;
    }
  }
}
