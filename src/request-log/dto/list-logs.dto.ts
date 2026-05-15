import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { PaginationQuerySchema } from '../../common/types/pagination';

export const ListLogsSchema = PaginationQuerySchema.extend({
  status: z.enum(['pending', 'success', 'error']).optional(),
  vin: z
    .string()
    .trim()
    .length(17)
    .regex(/^[A-HJ-NPR-Z0-9]+$/i)
    .optional(),
});

export class ListLogsDto extends createZodDto(ListLogsSchema) {}
