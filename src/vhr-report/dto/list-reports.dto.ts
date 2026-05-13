import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const ListReportsSchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).optional(),
  vin: z
    .string()
    .trim()
    .length(17)
    .regex(/^[A-HJ-NPR-Z0-9]+$/i)
    .optional(),
});

export class ListReportsDto extends createZodDto(ListReportsSchema) {}
