import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@db';
import { CreateJobDto } from './dto/create-job.dto';
import { PrismaService } from 'src/common/prisma/prisma.service';

@Injectable()
export class JobsService {
  private readonly logger = new Logger(JobsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async create(application: string, dto: CreateJobDto) {
    const vin = dto.vin.toUpperCase();
    const cached = await this.prisma.vhr_reports.findFirst({
      where: { vin },
      orderBy: { created_at: 'desc' },
      select: { id: true },
    });

    if (cached) {
      const job = await this.prisma.scrape_jobs.create({
        data: {
          vin,
          user_id: dto.userId,
          application,
          callback_url: dto.callbackUrl ?? null,
          max_attempts: dto.maxAttempts ?? 3,
          metadata: (dto.metadata ?? undefined) as
            | Prisma.InputJsonValue
            | undefined,
          status: 'done',
          vhr_report_id: cached.id,
          next_callback_at: dto.callbackUrl ? new Date() : null,
        },
      });
      this.logger.log(
        `Job satisfied from cache: id=${job.id} vin=${vin} vhrReportId=${cached.id} app=${application}`,
      );
      return { jobId: job.id, status: job.status, cached: true };
    }

    const job = await this.prisma.scrape_jobs.create({
      data: {
        vin,
        user_id: dto.userId,
        application,
        callback_url: dto.callbackUrl ?? null,
        max_attempts: dto.maxAttempts ?? 3,
        metadata: (dto.metadata ?? undefined) as
          | Prisma.InputJsonValue
          | undefined,
      },
    });
    this.logger.log(
      `Job queued: id=${job.id} vin=${vin} app=${application} user=${dto.userId}`,
    );
    return { jobId: job.id, status: job.status, cached: false };
  }

  async findById(application: string, jobId: string) {
    const job = await this.prisma.scrape_jobs.findFirst({
      where: { id: jobId, application },
    });
    if (!job) throw new NotFoundException('Job not found');
    return this.serialize(job);
  }

  /** Admin variant: no application filter — sees every job across all clients. */
  async findByIdForAdmin(jobId: string) {
    const job = await this.prisma.scrape_jobs.findUnique({
      where: { id: jobId },
    });
    if (!job) throw new NotFoundException('Job not found');
    return this.serialize(job);
  }

  /** Admin variant: list all jobs across all applications, newest first. */
  async listAllForAdmin(limit = 20, status?: 'queued' | 'processing' | 'done' | 'failed') {
    const jobs = await this.prisma.scrape_jobs.findMany({
      where: status ? { status } : {},
      orderBy: { created_at: 'desc' },
      take: Math.min(limit, 100),
    });
    return jobs.map((j) => this.serialize(j));
  }

  private serialize(job: Awaited<ReturnType<typeof this.prisma.scrape_jobs.findFirst>>) {
    if (!job) return null;
    return {
      jobId: job.id,
      vin: job.vin,
      status: job.status,
      userId: job.user_id,
      application: job.application,
      attempts: job.attempts,
      maxAttempts: job.max_attempts,
      vhrReportId: job.vhr_report_id,
      errorCode: job.error_code,
      error: job.error,
      metadata: job.metadata,
      createdAt: job.created_at,
      updatedAt: job.updated_at,
    };
  }
}