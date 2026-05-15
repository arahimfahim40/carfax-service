import { Module } from '@nestjs/common';
import { ApiClientsService } from './api-clients.service';
import { PrismaModule } from 'src/common/prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [ApiClientsService],
  exports: [ApiClientsService],
})
export class ApiClientsModule {}
