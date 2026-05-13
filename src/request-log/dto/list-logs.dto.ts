import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const ListLogsSchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).optional(),
  status: z.enum(['pending', 'success', 'error']).optional(),
  vin: z
    .string()
    .trim()
    .length(17)
    .regex(/^[A-HJ-NPR-Z0-9]+$/i)
    .optional(),
});

export class ListLogsDto extends createZodDto(ListLogsSchema) {}
