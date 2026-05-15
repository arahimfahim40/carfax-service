import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AdminGuard } from '../common/guards/admin.guard';
import { ApiClientsService } from '../api-clients/api-clients.service';
import { CreateApiClientDto } from '../api-clients/dto/create-api-client.dto';
import { PaginationQueryDto } from '../common/types/pagination';
import { RequestLogService } from '../request-log/request-log.service';
import { ListLogsDto } from '../request-log/dto/list-logs.dto';
import { LogStatsDto, parseWindowMs } from '../request-log/dto/log-stats.dto';
import { VhrReportService } from '../vhr-report/vhr-report.service';
import { ListReportsDto } from '../vhr-report/dto/list-reports.dto';
import { AdminScrapeDto } from '../scrape/dto/admin-scrape.dto';
import { JobsService } from '../jobs/jobs.service';
import { PlaywrightService } from '../playwright/playwright.service';
import { LookupVinDto } from 'src/scrape/dto/lookup-vin.dto';

const ADMIN_APPLICATION = 'admin';

@ApiTags('admin')
@Controller('admin')
@UseGuards(AdminGuard)
@ApiHeader({ name: 'x-admin-key', required: true })
export class AdminController {
  constructor(
    private readonly apiClients: ApiClientsService,
    private readonly requestLogs: RequestLogService,
    private readonly vhrReports: VhrReportService,
    private readonly jobs: JobsService,
    private readonly playwright: PlaywrightService,
  ) {}

  // ───────────── api-clients ─────────────

  @Post('api-clients')
  @HttpCode(201)
  @ApiOperation({
    summary: 'Create a new API client; returns the plaintext key ONCE',
  })
  createApiClient(@Body() dto: CreateApiClientDto) {
    return this.apiClients.create(dto);
  }

  @Get('api-clients')
  @ApiOperation({ summary: 'List all API clients (no secrets exposed)' })
  listApiClients(@Query() query: PaginationQueryDto) {
    return this.apiClients.list(query);
  }

  @Post('api-clients/:application/rotate')
  @ApiOperation({
    summary:
      'Rotate the API key + webhook secret for an existing client; un-revokes if revoked',
  })
  rotateApiClient(@Param('application') application: string) {
    return this.apiClients.rotate(application);
  }

  @Delete('api-clients/:application')
  @HttpCode(204)
  @ApiOperation({ summary: 'Revoke a client (soft-delete; key stops working)' })
  revokeApiClient(@Param('application') application: string) {
    return this.apiClients.revoke(application);
  }

  // ───────────── logs ─────────────

  @Get('logs')
  @ApiOperation({
    summary:
      'List recent request logs across all applications (admin view, newest first)',
  })
  listLogs(@Query() query: ListLogsDto) {
    return this.requestLogs.findRecent(query);
  }

  @Get('logs/stats')
  @ApiOperation({
    summary:
      'Aggregate counts + avg duration over a time window (e.g. 24h) — admin view',
  })
  logStats(@Query() query: LogStatsDto) {
    return this.requestLogs.stats(parseWindowMs(query.window));
  }

  // ───────────── reports ─────────────

  @Get('reports')
  @ApiOperation({
    summary: 'List all VHR reports (admin view, no api-key required)',
  })
  listReports(@Query() query: ListReportsDto) {
    return this.vhrReports.findRecent(query);
  }

  @Get('reports/:id')
  @ApiOperation({
    summary:
      'Get full report metadata + a fresh signed PDF URL (includes user_id + application)',
  })
  async getReport(@Param('id', ParseIntPipe) id: number) {
    const report = await this.vhrReports.findById(id);
    if (!report) throw new NotFoundException('Report not found');
    const key = this.vhrReports.extractKeyFromUrl(report.pdf_url);
    const downloadUrl = key
      ? await this.vhrReports.getDownloadUrl(key)
      : null;
    return { ...report, downloadUrl };
  }

  @Get('reports/:id/download')
  @ApiOperation({
    summary:
      'Get a fresh signed PDF URL for a report (admin override; bypasses api-key)',
  })
  async downloadReport(@Param('id', ParseIntPipe) id: number) {
    const report = await this.vhrReports.findById(id);
    if (!report) throw new NotFoundException('Report not found');
    const key = this.vhrReports.extractKeyFromUrl(report.pdf_url);
    if (!key) throw new NotFoundException('PDF key not derivable from URL');
    return {
      vhrReportId: report.id,
      vin: report.vin,
      pdfName: report.pdf_name,
      downloadUrl: await this.vhrReports.getDownloadUrl(key),
    };
  }

  // ───────────── scrape (async via jobs queue) ─────────────

  @Post('scrape/carfax-online')
  @HttpCode(202)
  @ApiOperation({
    summary:
      'Admin-triggered Carfax fetch. Enqueues a job and returns immediately with jobId — poll /admin/jobs/:jobId for status.',
  })
  async scrapeCarfax(@Body() body: AdminScrapeDto) {
    return this.jobs.create(ADMIN_APPLICATION, {
      vin: body.vin,
      userId: body.userId ?? null,
    } as any);
  }

  // ───────────── jobs (admin view, all applications) ─────────────

  @Get('jobs')
  @ApiOperation({
    summary: 'List recent jobs across all applications (admin view)',
  })
  listJobs(
    @Query('limit') limit?: string,
    @Query('status') status?: 'queued' | 'processing' | 'done' | 'failed',
  ) {
    return this.jobs.listAllForAdmin(limit ? Number(limit) : 20, status);
  }

  @Get('jobs/:jobId')
  @ApiOperation({
    summary: 'Get any job by id (admin view; no application filter)',
  })
  getJob(@Param('jobId') jobId: string) {
    return this.jobs.findByIdForAdmin(jobId);
  }

  @Post('scrape/lookup')
@HttpCode(200)
@ApiOperation({
  summary:
    'VIN lookup: returns cached report if present, else enqueues a job. Single round-trip from CRM.',
})
async lookupVin(@Body() body: LookupVinDto) {
  // 1) Cache lookup
  const cached = await this.vhrReports.findLatestByVin(body.vin);
  if (cached) {
    const key = this.vhrReports.extractKeyFromUrl(cached.pdf_url);
    const downloadUrl = key
      ? await this.vhrReports.getDownloadUrl(key)
      : null;
    return {
      source: 'cache' as const,
      vhrReportId: cached.id,
      vin: cached.vin,
      pdfName: cached.pdf_name,
      downloadUrl,
    };
  }

  // 2) Queue a job
  const job = await this.jobs.create(ADMIN_APPLICATION, {
    vin: body.vin,
    userId: body.userId ?? null,
  } as any);

  return {
    source: 'queued' as const,
    jobId: job.jobId,
    status: job.status,
    vin: body.vin,
  };
}

  // ───────────── browserbase ─────────────

  @Post('browserbase/rotate-context')
  @ApiOperation({
    summary:
      'Create a fresh Browserbase context and persist it in system_config. Next scrape will require a full login + MFA to imprint the new context.',
  })
  async rotateBrowserbaseContext() {
    const contextId = await this.playwright.rotateContext();
    return {
      contextId,
      note: 'Next scrape will require a full login + MFA to imprint the new context.',
    };
  }
}
