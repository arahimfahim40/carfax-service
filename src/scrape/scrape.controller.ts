import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  HttpCode,
  NotFoundException,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UseInterceptors,
} from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ScrapeService } from './scrape.service';
import { MfaCodeService } from './mfa-code.service';
import { RequestLogService } from '../request-log/request-log.service';
import { VhrReportService } from '../vhr-report/vhr-report.service';
import { ScrapeCarfaxDto } from './dto/scrape-carfax.dto';
import { SubmitMfaCodeDto } from './dto/submit-mfa-code.dto';
import { ListLogsDto } from '../request-log/dto/list-logs.dto';
import { LogStatsDto, parseWindowMs } from '../request-log/dto/log-stats.dto';
import { ListReportsDto } from '../vhr-report/dto/list-reports.dto';
import { RequestLogInterceptor } from '../request-log/request-log.interceptor';

@ApiTags('scrape')
@Controller('scrape')
export class ScrapeController {
  constructor(
    private readonly scrapeService: ScrapeService,
    private readonly mfaCodeService: MfaCodeService,
    private readonly requestLogService: RequestLogService,
    private readonly vhrReportService: VhrReportService,
  ) {}

  @Get('carfax-online')
  @UseInterceptors(RequestLogInterceptor)
  @ApiOperation({
    summary: 'Open carfaxonline.com via Playwright and return basic page info',
  })
  async openCarfaxOnline(@Query() query: ScrapeCarfaxDto) {
    return this.scrapeService.openCarfaxOnline(query.vin);
  }

  @Post('carfax-mfa-code')
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Submit a Carfax MFA code (called by n8n after extracting it from email)',
  })
  @ApiHeader({ name: 'x-mfa-secret', required: true })
  submitMfaCode(
    @Body() body: SubmitMfaCodeDto,
    @Headers('x-mfa-secret') secret: string,
  ) {
    const expected = process.env.MFA_WEBHOOK_SECRET;
    if (!expected || secret !== expected) {
      throw new ForbiddenException('Invalid MFA webhook secret');
    }
    const accepted = this.mfaCodeService.submitCode(body.code);
    return { accepted };
  }

  @Get('logs')
  @ApiOperation({ summary: 'List recent request logs (newest first)' })
  listLogs(@Query() query: ListLogsDto) {
    return this.requestLogService.findRecent(query);
  }

  @Get('logs/stats')
  @ApiOperation({
    summary: 'Aggregate counts + avg duration over a time window (e.g. 24h)',
  })
  logStats(@Query() query: LogStatsDto) {
    return this.requestLogService.stats(parseWindowMs(query.window));
  }

  @Get('reports')
  @ApiOperation({ summary: 'List recent VHR reports, optional VIN filter' })
  listReports(@Query() query: ListReportsDto) {
    return this.vhrReportService.findRecent(query);
  }

  @Get('reports/:id')
  @ApiOperation({ summary: 'Get VHR report metadata + a fresh signed PDF URL' })
  async getReport(@Param('id', ParseIntPipe) id: number) {
    const report = await this.vhrReportService.findById(id);
    if (!report) throw new NotFoundException('Report not found');
    const key = this.vhrReportService.extractKeyFromUrl(report.pdf_url);
    const downloadUrl = key
      ? await this.vhrReportService.getDownloadUrl(key)
      : null;
    return { ...report, downloadUrl };
  }

  @Get('reports/:id/download-url')
  @ApiOperation({ summary: 'Issue a fresh pre-signed PDF URL for a report' })
  async getReportDownloadUrl(@Param('id', ParseIntPipe) id: number) {
    const report = await this.vhrReportService.findById(id);
    if (!report) throw new NotFoundException('Report not found');
    const key = this.vhrReportService.extractKeyFromUrl(report.pdf_url);
    if (!key) throw new NotFoundException('PDF key not derivable from URL');
    return { downloadUrl: await this.vhrReportService.getDownloadUrl(key) };
  }
}
