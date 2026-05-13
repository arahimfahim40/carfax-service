import {
  ArgumentMetadata,
  BadRequestException,
  Injectable,
  PipeTransform,
} from '@nestjs/common';
import { flattenError, ZodError, ZodType } from 'zod';

@Injectable()
export class GlobalZodValidationPipe implements PipeTransform {
  async transform(value: any, metadata: ArgumentMetadata) {
    const target = metadata.metatype as any;
    const schema: ZodType | undefined = target?.schema;
    if (!schema) return value;
    try {
      const parse = await schema.safeParseAsync(value);
      if (parse.success) return parse.data;
      else {
        const error = {
          name: parse.error.name,
          error: flattenError(parse.error).fieldErrors,
        };
        throw new BadRequestException(error);
      }
    } catch (error) {
      if (error instanceof ZodError) {
        throw new BadRequestException(flattenError(error));
      }
      throw error;
    }
  }
}