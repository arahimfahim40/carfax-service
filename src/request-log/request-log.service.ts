import { Injectable } from '@nestjs/common';
import { Prisma } from '@db';
import { PrismaService } from '../common/prisma/prisma.service';
import { PaginationProvider } from '../common/providers/pagination.provider';
import { RequestLogStartDto } from './dto/request-log-start.dto';
import { RequestLogFinishDto } from './dto/request-log-finish.dto';
import { ListLogsDto } from './dto/list-logs.dto';

@Injectable()
export class RequestLogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pagination: PaginationProvider,
  ) {}

  async start(input: RequestLogStartDto): Promise<number> {
    const row = await this.prisma.request_logs.create({
      data: {
        method: input.method,
        path: input.path,
        query_params: (input.queryParams ??
          Prisma.JsonNull) as Prisma.InputJsonValue,
        request_ip: input.requestIp ?? null,
        user_agent: input.userAgent ?? null,
      },
      select: { id: true },
    });
    return row.id;
  }


  async logError(input: {
    method: string;
    path: string;
    queryParams?: unknown;
    requestIp?: string | null;
    userAgent?: string | null;
    httpStatus: number;
    durationMs: number;
    errorCode?: string | null;
    errorMessage?: string | null;
    vin?: string | null;
  }): Promise<number> {
    const row = await this.prisma.request_logs.create({
      data: {
        method: input.method,
        path: input.path,
        query_params: (input.queryParams ??
          Prisma.JsonNull) as Prisma.InputJsonValue,
        request_ip: input.requestIp ?? null,
        user_agent: input.userAgent ?? null,
        status: 'error',
        http_status: input.httpStatus,
        finished_at: new Date(),
        duration_ms: input.durationMs,
        error_code: input.errorCode ?? null,
        error_message: input.errorMessage ?? null,
        vin: input.vin ?? null,
      },
      select: { id: true },
    });
    return row.id;
  }

  async finish(id: number, outcome: RequestLogFinishDto): Promise<void> {
    await this.prisma.request_logs.update({
      where: { id },
      data: {
        status: outcome.status,
        http_status: outcome.httpStatus,
        finished_at: new Date(),
        duration_ms: outcome.durationMs,
        vin: outcome.vin ?? null,
        logged_in: outcome.loggedIn ?? null,
        used_existing_session: outcome.usedExistingSession ?? null,
        mfa_triggered: outcome.mfaTriggered ?? null,
        captcha_triggered: outcome.captchaTriggered ?? null,
        vhr_report_id: outcome.vhrReportId ?? null,
        error_code: outcome.errorCode ?? null,
        error_message: outcome.errorMessage ?? null,
      },
    });
  }

  async findRecent(filters: ListLogsDto) {
    const { status, vin, ...paginationQuery } = filters;
    const where = {
      ...(status ? { status } : {}),
      ...(vin ? { vin } : {}),
    };
    const { skip, take } = this.pagination.resolve(paginationQuery);
    const data = await this.prisma.request_logs.findMany({
      where,
      orderBy: { started_at: 'desc' },
      skip,
      take,
      include: {
        vhr_report: { select: { id: true, pdf_name: true, pdf_url: true } },
      },
    });
    return this.pagination.paginateQuery(
      paginationQuery,
      'request_logs',
      data,
      where,
    );
  }

  async stats(windowMs: number) {
    const since = new Date(Date.now() - windowMs);
    const grouped = await this.prisma.request_logs.groupBy({
      by: ['status'],
      where: { started_at: { gte: since } },
      _count: true,
      _avg: { duration_ms: true },
    });

    const total = grouped.reduce((sum, g) => sum + g._count, 0);
    const byStatus: Record<
      string,
      { count: number; avgDurationMs: number | null }
    > = {};
    for (const g of grouped) {
      byStatus[g.status] = {
        count: g._count,
        avgDurationMs: g._avg.duration_ms ?? null,
      };
    }

    return {
      since: since.toISOString(),
      total,
      byStatus,
    };
  }
}
