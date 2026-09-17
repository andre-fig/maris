import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { diskStorage } from 'multer';

import { API_CONFIG, type ApiConfig } from '../configuration/api-config.js';
import { ConfigurationModule } from '../configuration/configuration.module.js';
import { EncArchiveInspector } from './infrastructure/enc-archive-inspector.js';
import { ManifestRepository } from './infrastructure/manifest.repository.js';
import { IngestionsController } from './ingestions.controller.js';
import { IngestionsService } from './ingestions.service.js';

@Module({
  imports: [
    MulterModule.registerAsync({
      imports: [ConfigurationModule],
      inject: [API_CONFIG],
      useFactory: (config: ApiConfig) => {
        const temporaryDirectory = path.join(config.storageDirectory, '.tmp');
        mkdirSync(temporaryDirectory, { recursive: true });

        return {
          storage: diskStorage({
            destination: temporaryDirectory,
            filename: (_request, _file, callback) =>
              callback(null, `${randomUUID()}.zip`),
          }),
          limits: {
            fieldSize: 16 * 1024,
            fields: 4,
            fileSize: config.maxUploadBytes,
            files: 1,
            parts: 5,
          },
        };
      },
    }),
  ],
  controllers: [IngestionsController],
  providers: [
    EncArchiveInspector,
    IngestionsService,
    ManifestRepository,
  ],
})
export class IngestionsModule {}
