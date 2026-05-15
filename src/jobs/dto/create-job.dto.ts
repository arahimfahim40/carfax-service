import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const CreateJobSchema = z.object({
  vin: z
    .string()
    .trim()
    .length(17, 'VIN must be exactly 17 characters')
    .regex(/^[A-HJ-NPR-Z0-9]+$/i, 'VIN contains invalid characters'),
  userId: z.number().positive().optional().nullable(),
  callbackUrl: z.string().url().optional(),
  maxAttempts: z.number().int().min(1).max(5).optional(),
  metadata: z.record(z.string(),z.unknown()).optional(),
});

export class CreateJobDto extends createZodDto(CreateJobSchema) {}