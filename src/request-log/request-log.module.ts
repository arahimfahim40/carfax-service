import { Global, Module } from '@nestjs/common';
import { RequestLogService } from './request-log.service';
import { RequestLogInterceptor } from './request-log.interceptor';

@Global()
@Module({
  providers: [RequestLogService, RequestLogInterceptor],
  exports: [RequestLogService, RequestLogInterceptor],
})
export class RequestLogModule {}
