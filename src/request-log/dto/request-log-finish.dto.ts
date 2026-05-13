import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const RequestLogFinishSchema = z.object({
  status: z.enum(['pending', 'success', 'error']),
  httpStatus: z.number().int().min(100).max(599),
  durationMs: z.number().int().min(0),
  vin: z.string().length(17).nullable().optional(),
  loggedIn: z.boolean().nullable().optional(),
  usedExistingSession: z.boolean().nullable().optional(),
  mfaTriggered: z.boolean().nullable().optional(),
  captchaTriggered: z.boolean().nullable().optional(),
  vhrReportId: z.number().int().positive().nullable().optional(),
  errorCode: z.string().max(64).nullable().optional(),
  errorMessage: z.string().nullable().optional(),
});

export class RequestLogFinishDto extends createZodDto(RequestLogFinishSchema) {}
