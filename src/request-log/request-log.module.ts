import { Module } from '@nestjs/common';
import { RequestLogService } from './request-log.service';
import { RequestLogInterceptor } from './request-log.interceptor';

@Module({
  providers: [RequestLogService, RequestLogInterceptor],
  exports: [RequestLogService, RequestLogInterceptor],
})
export class RequestLogModule {}
