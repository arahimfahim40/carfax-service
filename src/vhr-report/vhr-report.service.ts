import { basename } from 'node:path';
import { Injectable, Logger } from '@nestjs/common';
// import { Prisma } from '@db';
import { PrismaService } from '../common/prisma/prisma.service';
import { PaginationProvider } from '../common/providers/pagination.provider';
import { FileUploadService } from '../common/service/file-upload';
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
