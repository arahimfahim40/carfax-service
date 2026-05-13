import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import appConfig from './common/config/app.config';
import { ConfigModule } from '@nestjs/config';
import { PlaywrightModule } from './playwright/playwright.module';
import { ScrapeModule } from './scrape/scrape.module';
import { PrismaModule } from './common/prisma/prisma.module';
const ENV = process.env.NODE_ENV;
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: !ENV ? '.env' : `.env.${ENV}`,
      load: [appConfig],
    }),
    PrismaModule,
    PlaywrightModule,
    ScrapeModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule { }
