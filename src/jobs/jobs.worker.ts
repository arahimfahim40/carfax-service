import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ScrapeService } from '../scrape/scrape.service';
import { VhrReportService } from '../vhr-report/vhr-report.service';
import { RequestLogService } from '../request-log/request-log.service';

import { PrismaService } from 'src/common/prisma/prisma.service';
import { WebhookService } from './webhook.service';
import { backoffMs, classify } from './error-classifier';

const POLL_INTERVAL_MS = 2_000;

@Injectable()
export class JobsWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(JobsWorker.name);
  private workers: Array<{ id: number; stop: boolean }> = [];

  constructor(
    private readonly prisma: PrismaService,
    private readonly scrape: ScrapeService,
    private readonly vhrReports: VhrReportService,
    private readonly webhook: WebhookService,
    private readonly requestLog: RequestLogService,
  ) {}

  onModuleInit() {
    const count = Math.max(1, Number(process.env.WORKER_COUNT ?? 1));
    this.logger.log(`Starting ${count} scrape worker(s)`);
    for (let i = 0; i < count; i++) {
      const w = { id: i, stop: false };
      this.workers.push(w);
      void this.loop(w);
    }
  }

  onModuleDestroy() {
    this.workers.forEach((w) => (w.stop = true));
  }

  private async loop(w: { id: number; stop: boolean }) {
    while (!w.stop) {
      try {
        const picked = await this.pickAndProcessOne();
        if (!picked) await sleep(POLL_INTERVAL_MS);
      } catch (err) {
        this.logger.error(`Worker ${w.id} loop error`, err as Error);
        await sleep(POLL_INTERVAL_MS);
      }
    }
  }

  /** Atomically pick one due job; returns false if nothing to do. */
  private async pickAndProcessOne(): Promise<boolean> {
    // Raw query because Prisma doesn't expose FOR UPDATE SKIP LOCKED.
    const rows = await this.prisma.$queryRaw<{ id: string }[]>`
      UPDATE scrape_jobs
      SET status = 'processing'::job_status, updated_at = now()
      WHERE id = (
        SELECT id FROM scrape_jobs
        WHERE status = 'queued' AND next_attempt_at <= now()
        ORDER BY next_attempt_at
        FOR UPDATE SKIP LOCKED
        LIMIT 1
      )
      RETURNING id;
    `;
    if (rows.length === 0) return false;
    const jobId = rows[0].id;
    await this.processJob(jobId);
    return true;
  }

  private async processJob(jobId: string) {
    const job = await this.prisma.scrape_jobs.findUniqueOrThrow({
      where: { id: jobId },
    });
    this.logger.log(
      `Processing job ${jobId} vin=${job.vin} attempt=${job.attempts + 1}/${job.max_attempts}`,
    );

    try {
      // Pass userId + application so they get persisted onto vhr_reports
      // when a real Carfax fetch happens (cache hits skip this entirely).
      const result = await this.scrape.openCarfaxOnline(job.vin, {
        userId: job.user_id??null,
        application: job.application,
      });
      if (!result.vhrReportId) {
        throw new Error(
          'Scrape completed but no vhr_report_id returned (probably blocked or no report)',
        );
      }
      const updated = await this.prisma.scrape_jobs.update({
        where: { id: jobId },
        data: {
          status: 'done',
          attempts: { increment: 1 },
          vhr_report_id: result.vhrReportId,
          error: null,
          error_code: null,
          next_callback_at: job.callback_url ? new Date() : null,
        },
      });
      this.logger.log(`Job ${jobId} done`);
      if (updated.callback_url) await this.webhook.deliver(updated.id);
    } catch (err) {
      await this.handleFailure(jobId, err);
    }
  }

  private async handleFailure(jobId: string, err: unknown) {
    const { code, message, retryable } = classify(err);
    const job = await this.prisma.scrape_jobs.findUniqueOrThrow({
      where: { id: jobId },
    });
    const nextAttempt = job.attempts + 1;
    const willRetry = retryable && nextAttempt < job.max_attempts;

    if (willRetry) {
      const wait = backoffMs(nextAttempt);
      await this.prisma.scrape_jobs.update({
        where: { id: jobId },
        data: {
          status: 'queued',
          attempts: nextAttempt,
          next_attempt_at: new Date(Date.now() + wait),
          error_code: code,
          error: message,
        },
      });
      this.logger.warn(
        `Job ${jobId} failed (${code}); retry ${nextAttempt}/${job.max_attempts} in ${wait}ms`,
      );
    } else {
      const updated = await this.prisma.scrape_jobs.update({
        where: { id: jobId },
        data: {
          status: 'failed',
          attempts: nextAttempt,
          error_code: code,
          error: message,
          next_callback_at: job.callback_url ? new Date() : null,
        },
      });
      this.logger.error(
        `Job ${jobId} failed permanently (${code}): ${message}`,
      );

      await this.requestLog
        .logError({
          method: 'JOB',
          path: `/jobs/${jobId}`,
          httpStatus: 500,
          durationMs: Date.now() - job.created_at.getTime(),
          errorCode: code,
          errorMessage: message,
          vin: job.vin,
        })
        .catch((logErr) =>
          this.logger.error(
            `Failed to persist job error log: ${(logErr as Error).message}`,
          ),
        );

      if (updated.callback_url) await this.webhook.deliver(updated.id);
    }
  }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}