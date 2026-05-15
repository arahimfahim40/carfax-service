import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const CreateApiClientSchema = z.object({
  application: z
    .string()
    .trim()
    .min(1)
    .max(64)
    .regex(/^[a-z0-9_-]+$/, 'lowercase letters, digits, dash, underscore only'),
  user_id:z.number().positive().optional().nullable()
});

export class CreateApiClientDto extends createZodDto(CreateApiClientSchema) {}