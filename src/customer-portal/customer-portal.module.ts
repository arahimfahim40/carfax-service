import { Module } from '@nestjs/common';
import { ApiClientsModule } from '../api-clients/api-clients.module';
import { JobsModule } from '../jobs/jobs.module';
import { VhrReportModule } from '../vhr-report/vhr-report.module';
import { CustomerPortalController } from './customer-portal.controller';

@Module({
  imports: [ApiClientsModule, JobsModule, VhrReportModule],
  controllers: [CustomerPortalController],
})
export class CustomerPortalModule {}
