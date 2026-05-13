import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const WINDOW_REGEX = /^(\d+)([smhd])$/;

export const LogStatsSchema = z.object({
  window: z
    .string()
    .regex(WINDOW_REGEX, 'window must look like "30s", "5m", "24h" or "7d"')
    .default('24h'),
});

export class LogStatsDto extends createZodDto(LogStatsSchema) {}

export function parseWindowMs(window: string): number {
  const match = WINDOW_REGEX.exec(window);
  if (!match) {
    throw new Error(`Invalid window: ${window}`);
  }
  const value = Number(match[1]);
  const unit = match[2];
  const factor =
    unit === 's' ? 1_000
    : unit === 'm' ? 60_000
    : unit === 'h' ? 3_600_000
    : 86_400_000;
  return value * factor;
}
