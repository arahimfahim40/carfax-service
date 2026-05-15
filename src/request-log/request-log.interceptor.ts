import {
  CallHandler,
  ExecutionContext,
  HttpException,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, catchError, throwError } from 'rxjs';
import { Request } from 'express';
import { RequestLogService } from './request-log.service';

@Injectable()
export class RequestLogInterceptor implements NestInterceptor {
  private readonly logger = new Logger(RequestLogInterceptor.name);

  constructor(private readonly requestLog: RequestLogService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const req = http.getRequest<Request>();
    const startedAt = Date.now();

    return next.handle().pipe(
      catchError((err: unknown) => {
        const httpStatus =
          err instanceof HttpException ? err.getStatus() : 500;
        const message = err instanceof Error ? err.message : 'Unknown error';
        const code =
          err instanceof HttpException ? err.constructor.name : 'Error';

        this.logger.warn(
          `Request failed: ${req.method} ${req.originalUrl} → ${httpStatus} (${code}: ${message})`,
        );

        void this.requestLog
          .logError({
            method: req.method,
            path: req.originalUrl?.split('?')[0] ?? req.url,
            queryParams: req.query,
            requestIp: req.ip ?? null,
            userAgent: req.headers['user-agent'] ?? null,
            httpStatus,
            durationMs: Date.now() - startedAt,
            errorCode: code,
            errorMessage: message,
          })
          .catch((logErr) =>
            this.logger.error(
              `Failed to persist error log: ${(logErr as Error).message}`,
            ),
          );

        return throwError(() => err);
      }),
    );
  }
}
