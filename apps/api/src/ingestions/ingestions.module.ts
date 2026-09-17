import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MulterModule } from '@nestjs/platform-express';
import { diskStorage } from 'multer';

import { EncArchiveService } from './services/enc-archive.service.js';
import { IngestionsController } from './ingestions.controller.js';
import { IngestionsService } from './services/ingestions.service.js';

@Module({
  imports: [
    MulterModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const storageDirectory = path.resolve(
          config.getOrThrow<string>('STORAGE_DIR'),
        );
        const temporaryDirectory = path.join(storageDirectory, '.tmp');
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
            fileSize: config.getOrThrow<number>('MAX_UPLOAD_BYTES'),
            files: 1,
            parts: 5,
          },
        };
      },
    }),
  ],
  controllers: [IngestionsController],
  providers: [EncArchiveService, IngestionsService],
})
export class IngestionsModule {}
