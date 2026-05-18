import { Module } from '@nestjs/common';
import appConfig from './common/config/app.config';
import { ConfigModule } from '@nestjs/config';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { PlaywrightModule } from './playwright/playwright.module';
import { ScrapeModule } from './scrape/scrape.module';
import { PrismaModule } from './common/prisma/prisma.module';
import { ApiClientsModule } from './api-clients/api-clients.module';
import { JobsModule } from './jobs/jobs.module';
import { AdminModule } from './admin/admin.module';
import { SystemConfigModule } from './common/system-config/system-config.module';
import { RequestLogModule } from './request-log/request-log.module';
import { RequestLogInterceptor } from './request-log/request-log.interceptor';
import { CustomerPortalModule } from './customer-portal/customer-portal.module'
const ENV = process.env.NODE_ENV;
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: !ENV ? '.env' : `.env.${ENV}`,
      load: [appConfig],
    }),
    PrismaModule,
    SystemConfigModule,
    RequestLogModule,
    PlaywrightModule,
    ScrapeModule,
    ApiClientsModule,
    JobsModule,
    CustomerPortalModule,
    AdminModule,
  ],
  providers: [
    {
      provide: APP_INTERCEPTOR,
      useClass: RequestLogInterceptor,
    },
  ],
})
export class AppModule { }
