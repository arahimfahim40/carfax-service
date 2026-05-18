import { Injectable, Logger } from '@nestjs/common';
import { createHash, randomBytes, timingSafeEqual } from 'crypto';
import { application_type } from '@db';
import { PrismaService } from 'src/common/prisma/prisma.service';
import { PaginationProvider } from 'src/common/providers/pagination.provider';
import { PaginationQueryDto } from 'src/common/types/pagination';
import { CreateApiClientDto } from './dto/create-api-client.dto';

@Injectable()
export class ApiClientsService {
  private readonly logger = new Logger(ApiClientsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly pagination: PaginationProvider,
  ) { }

  private hashKey(key: string): string {
    return createHash('sha256').update(key).digest('hex');
  }

  async findByKey(rawKey: string) {
    const hash = this.hashKey(rawKey);
    const client = await this.prisma.api_clients.findFirst({
      where: { api_key_hash: hash, revoked_at: null },
    });
    if (!client) return null;
    // timing-safe re-compare to be extra cautious
    if (
      !timingSafeEqual(
        Buffer.from(client.api_key_hash, 'hex'),
        Buffer.from(hash, 'hex'),
      )
    ) {
      return null;
    }
    return client;
  }

  async create(dto: CreateApiClientDto) {
    const rawKey = randomBytes(32).toString('hex');
    const webhookSecret = randomBytes(32).toString('hex');
    const created = await this.prisma.api_clients.create({
      data: {
        application: dto.application,
        api_key_hash: this.hashKey(rawKey),
        webhook_secret: webhookSecret,
        ...(dto.user_id ? { user_id: dto.user_id } : {})
      },
    });
    this.logger.log(`Provisioned API client: ${dto.application} and ${dto.user_id}`);
    return {
      application: created.application,
      apiKey: rawKey,
      webhookSecret,
    };
  }

  async revoke(application: application_type) {
    const result = await this.prisma.api_clients.updateMany({
      where: { application, revoked_at: null },
      data: { revoked_at: new Date() },
    });
    this.logger.warn(
      `Revoked ${result.count} api_client key(s) for application=${application}`,
    );
    return { revokedCount: result.count };
  }
  async list(paginationQuery: PaginationQueryDto) {
    const { skip, take } = this.pagination.resolve(paginationQuery);
    // Never expose api_key_hash or webhook_secret — that's why we explicit `select`.
    const data = await this.prisma.api_clients.findMany({
      select: {
        application: true,
        created_at: true,
        revoked_at: true,
      },
      orderBy: { created_at: 'desc' },
      skip,
      take,
    });
    return this.pagination.paginateQuery(
      paginationQuery,
      'api_clients',
      data,
    );
  }

  async rotate(application: application_type) {
    const target = await this.prisma.api_clients.findFirst({
      where: { application, revoked_at: null },
      orderBy: { created_at: 'desc' },
    });
    if (!target) {
      throw new Error(
        `No active api_clients found for application=${application}`,
      );
    }
    const rawKey = randomBytes(32).toString('hex');
    const webhookSecret = randomBytes(32).toString('hex');
    await this.prisma.api_clients.update({
      where: { id: target.id },
      data: {
        api_key_hash: this.hashKey(rawKey),
        webhook_secret: webhookSecret,
        revoked_at: null,
      },
    });
    this.logger.warn(
      `Rotated api_client id=${target.id} (application=${application})`,
    );
    return { application, apiKey: rawKey, webhookSecret };
  }
}