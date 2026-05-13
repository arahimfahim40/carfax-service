import {
  CallHandler,
  ExecutionContext,
  HttpException,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, catchError, tap, throwError } from 'rxjs';
import { Request, Response } from 'express';
import { RequestLogService } from './request-log.service';

type ScrapeResponseShape = Partial<{
  vin: string | null;
  loggedIn: boolean;
  usedExistingSession: boolean;
  mfaTriggered: boolean;
  captchaTriggered: boolean;
  vhrReportId: number;
}>;

@Injectable()
export class RequestLogInterceptor implements NestInterceptor {
  private readonly logger = new Logger(RequestLogInterceptor.name);

  constructor(private readonly requestLog: RequestLogService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const req = http.getRequest<Request>();
    const res = http.getResponse<Response>();
    const startedAt = Date.now();

    const startPromise = this.requestLog
      .start({
        method: req.method,
        path: req.originalUrl?.split('?')[0] ?? req.url,
        queryParams: req.query,
        requestIp: req.ip ?? null,
        userAgent: req.headers['user-agent'] ?? null,
      })
      .catch((err) => {
        this.logger.error(`Failed to start request log: ${err.message}`);
        return null;
      });

    return next.handle().pipe(
      tap(async (body: unknown) => {
        const id = await startPromise;
        if (id == null) return;
        const shape = (body ?? {}) as ScrapeResponseShape;
        await this.requestLog
          .finish(id, {
            status: 'success',
            httpStatus: res.statusCode,
            durationMs: Date.now() - startedAt,
            vin: shape.vin ?? null,
            loggedIn: shape.loggedIn ?? null,
            usedExistingSession: shape.usedExistingSession ?? null,
            mfaTriggered: shape.mfaTriggered ?? null,
            captchaTriggered: shape.captchaTriggered ?? null,
            vhrReportId: shape.vhrReportId ?? null,
          })
          .catch((err) =>
            this.logger.error(`Failed to finish request log ${id}: ${err.message}`),
          );
      }),
      catchError(async (err: unknown) => {
        const id = await startPromise;
        if (id != null) {
          const httpStatus =
            err instanceof HttpException ? err.getStatus() : 500;
          const message =
            err instanceof Error ? err.message : 'Unknown error';
          const code =
            err instanceof HttpException ? err.constructor.name : 'Error';
          await this.requestLog
            .finish(id, {
              status: 'error',
              httpStatus,
              durationMs: Date.now() - startedAt,
              errorCode: code,
              errorMessage: message,
            })
            .catch((logErr) =>
              this.logger.error(
                `Failed to finish errored request log ${id}: ${(logErr as Error).message}`,
              ),
            );
        }
        return throwError(() => err);
      }),
    );
  }
}
