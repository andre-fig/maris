import {
  BadRequestException,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  NotFoundException,
  Param,
  Post,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";

import { IngestionsService } from "./ingestions.service.js";

@Controller("v1/ingestions")
export class IngestionsController {
  constructor(
    @Inject(IngestionsService)
    private readonly ingestionsService: IngestionsService,
  ) {}

  @Post("enc")
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(FileInterceptor("file"))
  async createEncIngestion(@UploadedFile() file?: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('Multipart field "file" is required');
    }

    return this.ingestionsService.create(file);
  }

  @Get(":id")
  async findIngestion(@Param("id") id: string) {
    const ingestion = await this.ingestionsService.find(id);
    if (!ingestion) {
      throw new NotFoundException("Ingestion not found");
    }

    return ingestion;
  }
}
