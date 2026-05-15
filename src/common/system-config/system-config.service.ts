import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SystemConfigService {
  private readonly logger = new Logger(SystemConfigService.name);

  constructor(private readonly prisma: PrismaService) {}

  async get(key: string): Promise<string | null> {
    const row = await this.prisma.system_config.findUnique({ where: { key } });
    return row?.value ?? null;
  }

  async set(key: string, value: string | null): Promise<void> {
    await this.prisma.system_config.upsert({
      where: { key },
      create: { key, value },
      update: { value },
    });
    this.logger.log(`system_config: ${key} updated`);
  }
}
