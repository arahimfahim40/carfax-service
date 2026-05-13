import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const SubmitMfaCodeSchema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^\d{4,8}$/, 'code must be 4-8 digits'),
});

export class SubmitMfaCodeDto extends createZodDto(SubmitMfaCodeSchema) {}
