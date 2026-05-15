import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { PaginationProvider } from '../providers/pagination.provider';

@Global()
@Module({
  providers: [PrismaService, PaginationProvider],
  exports: [PrismaService, PaginationProvider],
})
export class PrismaModule {}
