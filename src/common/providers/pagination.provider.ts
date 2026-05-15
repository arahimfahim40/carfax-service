import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  Paginated,
  PaginationQueryDto,
  PrismaTableType,
} from '../types/pagination';

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 200;

@Injectable()
export class PaginationProvider {
  constructor(private readonly prisma: PrismaService) {}

  resolve(paginationQuery: PaginationQueryDto): {
    page: number;
    limit: number;
    skip: number;
    take: number;
  } {
    const page = this.normalize(paginationQuery.page, DEFAULT_PAGE);
    const limit = Math.min(
      this.normalize(paginationQuery.limit, DEFAULT_LIMIT),
      MAX_LIMIT,
    );
    return { page, limit, skip: (page - 1) * limit, take: limit };
  }

  async paginateQuery<T>(
    paginationQuery: PaginationQueryDto,
    repository: PrismaTableType,
    result: T[],
    where: Record<string, unknown> = {},
  ): Promise<Paginated<T>> {
    const { page, limit } = this.resolve(paginationQuery);
    const model = this.prisma[repository] as any;
    const totalItems: number = await model.count({ where });

    return {
      result: true,
      data: result,
      meta: {
        itemsPerPage: limit,
        totalItems,
        currentPage: page,
        totalPages: limit > 0 ? Math.ceil(totalItems / limit) : 0,
      },
    };
  }

  private normalize(value: number | undefined, fallback: number): number {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
  }
}
