import { Module } from '@nestjs/common';
import { ScrapeController } from './scrape.controller';
import { ScrapeService } from './scrape.service';
import { MfaCodeService } from './mfa-code.service';
import { RequestLogModule } from '../request-log/request-log.module';
import { VhrReportModule } from '../vhr-report/vhr-report.module';

@Module({
  imports: [RequestLogModule, VhrReportModule],
  controllers: [ScrapeController],
  providers: [ScrapeService, MfaCodeService],
})
export class ScrapeModule {}
