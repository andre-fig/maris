import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, open, rename, rm } from 'node:fs/promises';
import path from 'node:path';

import { Inject, Injectable, UnprocessableEntityException } from '@nestjs/common';

import { API_CONFIG, type ApiConfig } from '../configuration/api-config.js';
import type { IngestionManifest } from './domain/ingestion.js';
import { EncArchiveInspector } from './infrastructure/enc-archive-inspector.js';
import { ManifestRepository } from './infrastructure/manifest.repository.js';

const ACCEPTED_MIME_TYPES = new Set([
  'application/octet-stream',
  'application/x-zip-compressed',
  'application/zip',
]);

function invalidEnc(code: string, message: string) {
  return new UnprocessableEntityException({ code, message, statusCode: 422 });
}

@Injectable()
export class IngestionsService {
  constructor(
    @Inject(API_CONFIG) private readonly config: ApiConfig,
    @Inject(EncArchiveInspector)
    private readonly archiveInspector: EncArchiveInspector,
    @Inject(ManifestRepository)
    private readonly manifestRepository: ManifestRepository,
  ) {}

  async create(file: Express.Multer.File): Promise<IngestionManifest> {
    const ingestionId = randomUUID();
    const ingestionDirectory = path.join(
      this.config.storageDirectory,
      'ingestions',
      ingestionId,
    );
    const archivePath = path.join(ingestionDirectory, 'source.zip');

    try {
      this.validateUpload(file);
      await this.assertZipSignature(file.path);
      const archive = await this.archiveInspector.inspect(file.path);
      const checksum = await this.calculateChecksum(file.path);

      await mkdir(ingestionDirectory, { recursive: true });
      await rename(file.path, archivePath);

      const manifest: IngestionManifest = {
        archive,
        checksum: { algorithm: 'sha256', value: checksum },
        createdAt: new Date().toISOString(),
        id: ingestionId,
        originalFilename: path.basename(file.originalname),
        sizeBytes: file.size,
        sourceType: 'S57',
        status: 'received',
        storagePath: path.relative(this.config.storageDirectory, archivePath),
      };

      await this.manifestRepository.save(manifest);
      return manifest;
    } catch (error) {
      await rm(file.path, { force: true });
      await rm(ingestionDirectory, { force: true, recursive: true });
      throw error;
    }
  }

  find(id: string) {
    return this.manifestRepository.findById(id);
  }

  private validateUpload(file: Express.Multer.File) {
    if (!file.originalname.toLowerCase().endsWith('.zip')) {
      throw invalidEnc(
        'INVALID_FILE_EXTENSION',
        'ENC upload must be a .zip file',
      );
    }

    if (!ACCEPTED_MIME_TYPES.has(file.mimetype.toLowerCase())) {
      throw invalidEnc(
        'INVALID_CONTENT_TYPE',
        `Unsupported content type: ${file.mimetype}`,
      );
    }

    if (file.size === 0) {
      throw invalidEnc('EMPTY_UPLOAD', 'Uploaded ZIP is empty');
    }
  }

  private async assertZipSignature(filePath: string) {
    const file = await open(filePath, 'r');
    try {
      const signature = Buffer.alloc(4);
      const { bytesRead } = await file.read(signature, 0, signature.length, 0);
      if (bytesRead !== 4 || signature[0] !== 0x50 || signature[1] !== 0x4b) {
        throw invalidEnc('INVALID_ZIP_SIGNATURE', 'File is not a ZIP archive');
      }
    } finally {
      await file.close();
    }
  }

  private async calculateChecksum(filePath: string) {
    const checksum = createHash('sha256');
    for await (const chunk of createReadStream(filePath)) {
      checksum.update(chunk);
    }
    return checksum.digest('hex');
  }
}
