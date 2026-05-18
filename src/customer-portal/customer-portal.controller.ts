import {
  Body,
  Controller,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { AdminScrapeDto } from '../scrape/dto/admin-scrape.dto';
import { JobsService } from '../jobs/jobs.service';
import { VhrReportService } from '../vhr-report/vhr-report.service';
import { ListCustomerReportsDto } from './dto/list-customer-reports.dto';
import { application_type } from '@db';
import { CustomerPotalGuard } from 'src/common/guards/customer-portal.guard';

@ApiTags('customer-portal')
@Controller('customer-portal')
@UseGuards(CustomerPotalGuard)
@ApiHeader({ name: 'x-api-key', required: true })
export class CustomerPortalController {
  constructor(
    private readonly jobs: JobsService,
    private readonly vhrReports: VhrReportService,
  ) { }


  @Post('scrape/carfax-online')
  @HttpCode(202)
  @ApiOperation({
    summary:
      'Customer-portal-triggered Carfax fetch. Enqueues a job stamped with application="customer_portal" + the company id as user_id, and returns immediately with jobId.',
  })
  async scrapeCarfax(@Body() body: AdminScrapeDto) {
    return this.jobs.create(application_type.customer_portal, {
      vin: body.vin,
      userId: body.userId ?? null,
    } as any);
  }


  @Get('reports')
  @ApiOperation({
    summary:
      'List VHR reports for a specific company (user_id). Optional ?vin= for polling a specific lookup.',
  })
  listReports(@Query() query: ListCustomerReportsDto) {
    return this.vhrReports.findRecentForCustomer(query);
  }

  @Get('reports/:id/download')
  @ApiOperation({
    summary: 'Fresh signed PDF download URL for a report (by id).',
  })
  async downloadReport(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: Request,
  ) {
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

  // ───────────── jobs ─────────────

  @Get('jobs/:jobId')
  @ApiOperation({
    summary: 'Get a customer-portal job by id (status + result).',
  })
  getJob(@Param('jobId') jobId: string) {
    return this.jobs.findById(application_type.customer_portal, jobId);
  }
}
