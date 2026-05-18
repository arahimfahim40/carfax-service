import { Module, OnModuleInit } from '@nestjs/common';
import { ScrapeModule } from '../scrape/scrape.module';
import { VhrReportModule } from '../vhr-report/vhr-report.module';
import { ApiClientsModule } from '../api-clients/api-clients.module';
import { RequestLogModule } from '../request-log/request-log.module';
import { JobsController } from './jobs.controller';
import { JobsService } from './jobs.service';
import { JobsWorker } from './jobs.worker';
import { WebhookService } from './webhook.service';
import { PrismaModule } from 'src/common/prisma/prisma.module';

@Module({
  imports: [PrismaModule, ScrapeModule, VhrReportModule, ApiClientsModule, RequestLogModule],
  controllers: [JobsController],
  providers: [JobsService, JobsWorker, WebhookService],
  exports: [JobsService],
})
export class JobsModule implements OnModuleInit {
  constructor(private readonly webhook: WebhookService) {}
  onModuleInit() {
    this.webhook.startRetryLoop();
  }
}