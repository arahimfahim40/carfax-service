import { basename } from 'node:path';
import { Injectable, Logger } from '@nestjs/common';
import { application_type } from '@db';
import { PrismaService } from '../common/prisma/prisma.service';
import { PaginationProvider } from '../common/providers/pagination.provider';
import { FileUploadService } from '../common/service/file-upload';
import { PaginationQueryDto } from '../common/types/pagination';
import { CreateVhrReportDto } from './dto/create-vhr-report.dto';
import { ListReportsDto } from './dto/list-reports.dto';

@Injectable()
export class VhrReportService {
  private readonly logger = new Logger(VhrReportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly fileUpload: FileUploadService,
    private readonly pagination: PaginationProvider,
  ) { }

  async create(input: CreateVhrReportDto) {
    const key = this.fileUpload.buildReportKey(input.vin);

    const uploaded = await this.fileUpload.uploadPdf({
      filePath: input.pdfFilePath,
      body: input.pdfBody,
      key,
    });

    const row = await this.prisma.vhr_reports.create({
      data: {
        vin: input.vin,
        // json_payload: (input.jsonPayload ??
        //   Prisma.JsonNull) as Prisma.InputJsonValue,
        json_payload: "{}",
        pdf_name: basename(uploaded.key),
        pdf_url: uploaded.url,
        user_id: input.userId ?? null,
        application: input.application ?? null,
      },
    });

    this.logger.log(`Created vhr_reports row id=${row.id} for vin=${input.vin}`);

    return { row, uploaded };
  }

  findById(id: number) {
    return this.prisma.vhr_reports.findUnique({ where: { id } });
  }

  findLatestByVin(vin: string) {
    return this.prisma.vhr_reports.findFirst({
      where: { vin },
      orderBy: { created_at: 'desc' },
    });
  }

  async findRecent(filters: ListReportsDto) {
    const { vin, ...paginationQuery } = filters;
    const where = vin ? { vin } : {};
    const { skip, take } = this.pagination.resolve(paginationQuery);
    const data = await this.prisma.vhr_reports.findMany({
      where,
      orderBy: { created_at: 'desc' },
      skip,
      take,
    });
    return this.pagination.paginateQuery(
      paginationQuery,
      'vhr_reports',
      data,
      where,
    );
  }

  async findRecentForCustomer(
    filters: PaginationQueryDto & { user_id: number; vin?: string },
  ) {
    const { user_id, vin, ...paginationQuery } = filters;
    const { skip, take } = this.pagination.resolve(paginationQuery);
    const where = {
      ...(vin ? { vin } : {}),
      scrape_jobs: {
        some: {
          user_id,
          application: application_type.customer_portal,
        },
      },
    };

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthlyWhere = {
      scrape_jobs: {
        some: {
          user_id,
          application: application_type.customer_portal,
          updated_at: { gte: startOfMonth },
        },
      },
    };

    const [data, allTimeCount, thisMonthCount] = await Promise.all([
      this.prisma.vhr_reports.findMany({
        where,
        orderBy: { created_at: 'desc' },
        include: {
          scrape_jobs: {
            where: { user_id, status: 'done' },
            orderBy: { updated_at: 'desc' },
            take: 1,
            select: { updated_at: true },
          },
        },
        skip,
        take,
      }),
      this.prisma.vhr_reports.count({ where }),
      this.prisma.vhr_reports.count({ where: monthlyWhere }),
    ]);

    const { page, limit } = this.pagination.resolve(paginationQuery);
    return {
      result: true,
      data: data.map((r) => {
        const job = r.scrape_jobs[0];
        return {
          id: r.id,
          vin: r.vin,
          pdf_name: r.pdf_name,
          pdf_url: r.pdf_url,
          user_id: r.user_id,
          application: r.application,
          created_at: job?.updated_at ?? r.created_at,
        };
      }),
      meta: {
        itemsPerPage: limit,
        totalItems: allTimeCount,
        currentPage: page,
        totalPages: limit > 0 ? Math.ceil(allTimeCount / limit) : 0,
        thisMonthCount,
      },
    };
  }

  getDownloadUrl(key: string, ttlSeconds?: number) {
    return this.fileUpload.getSignedDownloadUrl(key, { ttlSeconds });
  }

  extractKeyFromUrl(pdfUrl: string): string | null {
    try {
      const parsed = new URL(pdfUrl);
      const path = parsed.pathname.replace(/^\/+/, '');
      const slash = path.indexOf('/');
      return slash >= 0 ? path.slice(slash + 1) : path;
    } catch {
      return null;
    }
  }
}
