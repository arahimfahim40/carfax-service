import { UnauthorizedException } from '@nestjs/common';

export type ErrorCode =
  | 'DATADOME_TIMEOUT'
  | 'BROWSER_DISCONNECTED'
  | 'NETWORK_ERROR'
  | 'PAGE_TIMEOUT'
  | 'LOGIN_FAILED'
  | 'INVALID_VIN'
  | 'ACCOUNT_LOCKED'
  | 'UNKNOWN';

const RETRYABLE: Set<ErrorCode> = new Set([
  'DATADOME_TIMEOUT',
  'BROWSER_DISCONNECTED',
  'NETWORK_ERROR',
  'PAGE_TIMEOUT',
  'UNKNOWN',
]);

export interface ClassifiedError {
  code: ErrorCode;
  message: string;
  retryable: boolean;
}

export function classify(err: unknown): ClassifiedError {
  const msg = err instanceof Error ? err.message : String(err);
  const code = pickCode(err, msg);
  return { code, message: msg, retryable: RETRYABLE.has(code) };
}

function pickCode(err: unknown, msg: string): ErrorCode {
  if (err instanceof UnauthorizedException) return 'LOGIN_FAILED';
  if (/datadome|captcha/i.test(msg)) return 'DATADOME_TIMEOUT';
  if (/disconnected|target closed|websocket/i.test(msg)) {
    return 'BROWSER_DISCONNECTED';
  }
  if (/ENOTFOUND|ECONNRESET|ECONNREFUSED|EAI_AGAIN/i.test(msg)) {
    return 'NETWORK_ERROR';
  }
  if (/timeout|timed out/i.test(msg)) return 'PAGE_TIMEOUT';
  if (/invalid vin|vin not found|404/i.test(msg)) return 'INVALID_VIN';
  if (/\b(account\s+locked|locked\s+out|suspended)\b/i.test(msg)) return 'ACCOUNT_LOCKED';
  return 'UNKNOWN';
}

/** Backoff in ms for attempt N (1-indexed). */
export function backoffMs(attempt: number): number {
  const schedule = [30_000, 120_000, 600_000, 1_800_000]; // 30s, 2m, 10m, 30m
  return schedule[Math.min(attempt - 1, schedule.length - 1)];
}
