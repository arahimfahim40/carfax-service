import { Injectable, Logger } from '@nestjs/common';
import { createHmac } from 'crypto';
import { PrismaService } from 'src/common/prisma/prisma.service';

const DELIVERY_BACKOFF_MS = [0, 30_000, 120_000, 600_000, 3_600_000];
const MAX_DELIVERY_ATTEMPTS = 5;

@Injectable()
export class WebhookService {
  private readonly logger = new Logger(WebhookService.name);

  constructor(private readonly prisma: PrismaService) {}

  async deliver(jobId: string) {
    const job = await this.prisma.scrape_jobs.findUniqueOrThrow({
      where: { id: jobId },
      include: { vhr_report: true },
    });
    if (!job.callback_url) return;
    if (job.callback_delivered_at) return;
    if (job.callback_attempts >= MAX_DELIVERY_ATTEMPTS) return;

    const auth = await this.resolveAuth(job.application);
    if (!auth) {
      this.logger.error(
        `No webhook auth for application=${job.application}; cannot deliver webhook`,
      );
      return;
    }

    const body = this.buildPayload(job);
    const raw = JSON.stringify(body);
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Carfax-Event': `job.${job.status}`,
    };
    if (auth.kind === 'hmac') {
      headers['X-Carfax-Signature'] =
        'sha256=' + createHmac('sha256', auth.secret).update(raw).digest('hex');
    } else {
      headers['X-Carfax-Internal-Token'] = auth.secret;
    }

    try {
      const res = await fetch(job.callback_url, {
        method: 'POST',
        headers,
        body: raw,
        signal: AbortSignal.timeout(10_000),
      });
      if (res.ok) {
        await this.prisma.scrape_jobs.update({
          where: { id: jobId },
          data: {
            callback_attempts: { increment: 1 },
            callback_delivered_at: new Date(),
            next_callback_at: null,
          },
        });
        this.logger.log(`Webhook delivered for job ${jobId}`);
        return;
      }
      throw new Error(`Webhook returned ${res.status}`);
    } catch (err) {
      const attempts = job.callback_attempts + 1;
      const giveUp = attempts >= MAX_DELIVERY_ATTEMPTS;
      const wait = DELIVERY_BACKOFF_MS[Math.min(attempts, DELIVERY_BACKOFF_MS.length - 1)];
      await this.prisma.scrape_jobs.update({
        where: { id: jobId },
        data: {
          callback_attempts: attempts,
          next_callback_at: giveUp ? null : new Date(Date.now() + wait),
        },
      });
      this.logger.warn(
        `Webhook attempt ${attempts}/${MAX_DELIVERY_ATTEMPTS} failed for job ${jobId}: ${(err as Error).message}` +
          (giveUp ? ' — giving up' : ` — retry in ${wait}ms`),
      );
    }
  }

  private async resolveAuth(
    application: string,
  ): Promise<{ kind: 'hmac' | 'bearer'; secret: string } | null> {
    if (application === 'admin' || application === 'customer_portal') {
      const token = process.env.CARFAX_INTERNAL_WEBHOOK_SECRET;
      return token ? { kind: 'bearer', secret: token } : null;
    }
    const client = await this.prisma.api_clients.findFirst({
      where: { application: application as any, revoked_at: null },
      orderBy: { created_at: 'desc' },
    });
    return client ? { kind: 'hmac', secret: client.webhook_secret } : null;
  }

  /** Background poller: retries undelivered webhooks. Started in module init. */
  startRetryLoop() {
    setInterval(() => void this.processDueRetries(), 10_000);
  }

  private async processDueRetries() {
    const due = await this.prisma.scrape_jobs.findMany({
      where: {
        callback_url: { not: null },
        callback_delivered_at: null,
        callback_attempts: { lt: MAX_DELIVERY_ATTEMPTS },
        next_callback_at: { lte: new Date() },
        status: { in: ['done', 'failed'] },
      },
      take: 20,
    });
    for (const job of due) {
      await this.deliver(job.id);
    }
  }

  private buildPayload(job: Awaited<ReturnType<typeof this.prisma.scrape_jobs.findUniqueOrThrow>>) {
    const base = {
      jobId: job.id,
      vin: job.vin,
      status: job.status,
      userId: job.user_id,
      application: job.application,
      attempts: job.attempts,
      maxAttempts: job.max_attempts,
      metadata: job.metadata,
    };
    if (job.status === 'done') {
      return {
        ...base,
        vhrReportId: job.vhr_report_id,
        // signed URL is generated client-side via GET /reports/:id/download-url
        // because it expires — don't bake a stale one into the webhook.
        completedAt: job.updated_at,
      };
    }
    return {
      ...base,
      errorCode: job.error_code,
      error: job.error,
      failedAt: job.updated_at,
    };
  }
}