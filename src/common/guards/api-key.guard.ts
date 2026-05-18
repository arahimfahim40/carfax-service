import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { application_type } from '@db';
import { ApiClientsService } from 'src/api-clients/api-clients.service';

declare module 'express' {
  interface Request {
    application?: application_type;
    webhookSecret?: string;
  }
}

@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private readonly apiClients: ApiClientsService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest();
    const key = req.headers['x-api-key'];
    if (!key || typeof key !== 'string') {
      throw new UnauthorizedException('Missing x-api-key header');
    }

    const client = await this.apiClients.findByKey(key);
    if (!client) {
      throw new UnauthorizedException('Invalid or revoked API key');
    }

    req.application = client.application;
    req.webhookSecret = client.webhook_secret;
    return true;
  }
}