import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const LookupVinSchema = z.object({
  vin: z
    .string()
    .trim()
    .length(17, 'VIN must be exactly 17 characters')
    .regex(/^[A-HJ-NPR-Z0-9]+$/i, 'VIN contains invalid characters')
    .transform((v) => v.toUpperCase()),
  userId: z.number().int().positive().optional().nullable(),
});

export class LookupVinDto extends createZodDto(LookupVinSchema) {}