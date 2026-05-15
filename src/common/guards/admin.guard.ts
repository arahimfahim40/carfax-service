import {
  CanActivate,
  ExecutionContext,
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { timingSafeEqual } from 'crypto';

@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const expected = process.env.ADMIN_API_KEY;
    if (!expected) {
      throw new InternalServerErrorException('ADMIN_API_KEY is not configured');
    }
    const req = ctx.switchToHttp().getRequest();
    const key = req.headers['x-admin-key'];
    if (!key || typeof key !== 'string') {
      throw new UnauthorizedException('Missing x-admin-key header');
    }
    const a = Buffer.from(key);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new UnauthorizedException('Invalid admin key');
    }
    return true;
  }
}