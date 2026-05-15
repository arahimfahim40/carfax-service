import { PrismaClient } from '@db';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const PaginationQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(200).optional().default(20),
});

export class PaginationQueryDto extends createZodDto(PaginationQuerySchema) {}

export interface Paginated<T> {
  result: boolean;
  data: T[];
  meta: {
    itemsPerPage: number;
    totalItems: number;
    currentPage: number;
    totalPages: number;
  };
}

type OmitExtraObjectFromPrismaClient =
  | '$on'
  | '$connect'
  | '$disconnect'
  | '$use'
  | '$executeRaw'
  | '$queryRaw'
  | '$queryRawUnsafe'
  | '$transaction'
  | '$executeRawUnsafe'
  | '$extends'
  | symbol;
export type PrismaTableType = keyof Omit<
  PrismaClient,
  OmitExtraObjectFromPrismaClient
>;
