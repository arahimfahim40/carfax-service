import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const CreateVhrReportSchema = z
  .object({
    vin: z
      .string()
      .trim()
      .length(17)
      .regex(/^[A-HJ-NPR-Z0-9]+$/i),
    jsonPayload: z.unknown(),
    pdfFilePath: z.string().min(1).optional(),
    pdfBody: z.instanceof(Uint8Array).optional(),
  })
  .refine((d) => !!d.pdfFilePath || !!d.pdfBody, {
    message: 'Either pdfFilePath or pdfBody is required',
  });

export class CreateVhrReportDto extends createZodDto(CreateVhrReportSchema) {}
