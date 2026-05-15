import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { PaginationQuerySchema } from '../../common/types/pagination';

export const ListReportsSchema = PaginationQuerySchema.extend({
  vin: z
    .string()
    .trim()
    .length(17)
    .regex(/^[A-HJ-NPR-Z0-9]+$/i)
    .optional(),
});

export class ListReportsDto extends createZodDto(ListReportsSchema) {}
