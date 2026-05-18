import {
  CanActivate,
  ExecutionContext,
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { timingSafeEqual } from 'crypto';

@Injectable()
export class CustomerPotalGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const expected = process.env.CARFAX_CUSTOMER_PORTAL_KEY;
    if (!expected) {
      throw new InternalServerErrorException('CARFAX_CUSTOMER_PORTAL_KEY is not configured');
    }
    const req = ctx.switchToHttp().getRequest();
    const key = req.headers['x-api-key'];
    if (!key || typeof key !== 'string') {
      throw new UnauthorizedException('Missing x-api-key header');
    }
    const a = Buffer.from(key);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new UnauthorizedException('Invalid admin key');
    }
    return true;
  }
}