import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { ApiKeyGuard } from '../common/guards/api-key.guard';
import { CreateJobDto } from './dto/create-job.dto';
import { JobsService } from './jobs.service';

@ApiTags('jobs')
@Controller('scrape/jobs')
@UseGuards(ApiKeyGuard)
@ApiHeader({ name: 'x-api-key', required: true })
export class JobsController {
  constructor(private readonly jobs: JobsService) {}

  @Post()
  @HttpCode(202)
  @ApiOperation({ summary: 'Enqueue a Carfax scrape job; returns immediately' })
  create(@Body() dto: CreateJobDto, @Req() req: Request) {
    return this.jobs.create(req.application!, dto);
  }

  @Get(':jobId')
  @ApiOperation({ summary: 'Get job status + result (when done)' })
  get(@Param('jobId') jobId: string, @Req() req: Request) {
    return this.jobs.findById(req.application!, jobId);
  }
}