import { Module } from '@nestjs/common';
import { ApiClientsModule } from '../api-clients/api-clients.module';
import { RequestLogModule } from '../request-log/request-log.module';
import { VhrReportModule } from '../vhr-report/vhr-report.module';
import { ScrapeModule } from '../scrape/scrape.module';
import { JobsModule } from '../jobs/jobs.module';
import { AdminController } from './admin.controller';

@Module({
  imports: [
    ApiClientsModule,
    RequestLogModule,
    VhrReportModule,
    ScrapeModule,
    JobsModule,
  ],
  controllers: [AdminController],
})
export class AdminModule {}
