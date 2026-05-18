import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { PaginationQuerySchema } from '../../common/types/pagination';

export const ListCustomerReportsSchema = PaginationQuerySchema.extend({
  user_id: z.coerce.number().int().positive(),
  vin: z
    .string()
    .trim()
    .length(17)
    .regex(/^[A-HJ-NPR-Z0-9]+$/i)
    .optional(),
});

export class ListCustomerReportsDto extends createZodDto(
  ListCustomerReportsSchema,
) {}
