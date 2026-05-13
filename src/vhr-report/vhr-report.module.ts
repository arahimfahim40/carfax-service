import { Module } from '@nestjs/common';
import { VhrReportService } from './vhr-report.service';
import { FileUploadService } from '../common/service/file-upload';

@Module({
  providers: [VhrReportService, FileUploadService],
  exports: [VhrReportService],
})
export class VhrReportModule {}
