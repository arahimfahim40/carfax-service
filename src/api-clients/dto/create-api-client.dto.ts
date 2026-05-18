import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const CreateApiClientSchema = z.object({
  application: z
    .enum(['admin', 'customer_portal', 'client'])
    .default('client'),
  user_id: z.number().positive().optional().nullable(),
});

export class CreateApiClientDto extends createZodDto(CreateApiClientSchema) {}