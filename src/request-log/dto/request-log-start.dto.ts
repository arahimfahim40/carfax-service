import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const RequestLogStartSchema = z.object({
  method: z.string().min(1).max(10),
  path: z.string().min(1).max(255),
  queryParams: z.unknown().optional(),
  requestIp: z.string().max(45).nullable().optional(),
  userAgent: z.string().max(500).nullable().optional(),
});

export class RequestLogStartDto extends createZodDto(RequestLogStartSchema) {}
