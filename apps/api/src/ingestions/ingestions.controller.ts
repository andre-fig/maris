import {
  BadRequestException,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';

import type { IngestionDto, UploadEncDto } from './dto/ingestion.dto.js';
import { IngestionsService } from './ingestions.service.js';

@Controller('v1/ingestions')
export class IngestionsController {
  constructor(
    @Inject(IngestionsService)
    private readonly ingestionsService: IngestionsService,
  ) {}

  @Post('enc')
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(FileInterceptor("file"))
  async createEncIngestion(
    @UploadedFile() file?: UploadEncDto['file'],
  ): Promise<IngestionDto> {
    if (!file) {
      throw new BadRequestException('Multipart field "file" is required');
    }

    return this.ingestionsService.create(file);
  }

  @Get(':id')
  async findIngestion(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ): Promise<IngestionDto> {
    const ingestion = await this.ingestionsService.find(id);
    if (!ingestion) {
      throw new NotFoundException('Ingestion not found');
    }

    return ingestion;
  }
}
