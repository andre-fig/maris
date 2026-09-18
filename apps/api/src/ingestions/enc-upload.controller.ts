import { Body, Controller, Delete, Get, Param, Post, BadRequestException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { randomUUID } from 'node:crypto';
import { EncUpload } from './entities/enc-upload.entity.js';
import { ObjectStorageService } from '../storage/object-storage.service.js';
import { ProcessingDispatcherService } from './services/processing-dispatcher.service.js';

@Controller('enc-uploads')
export class EncUploadController {
  constructor(private readonly db: DataSource, private readonly storage: ObjectStorageService, private readonly dispatcher: ProcessingDispatcherService) {}
  @Post('multipart')
  async create(@Body() body: { filename: string; size?: number; checksumSha256?: string }) {
    const key = `sources/${new Date().toISOString().slice(0,10)}/${randomUUID()}-${String(body.filename).replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    const upload = await this.storage.createMultipart(key);
    await this.db.getRepository(EncUpload).save({ id: randomUUID(), uploadId: upload.uploadId, objectKey: key, sourceFilename: body.filename, expectedSize: body.size == null ? null : String(body.size), checksumSha256: body.checksumSha256 ?? null, status: 'uploading', parts: [] });
    return { uploadId: upload.uploadId, objectKey: key };
  }
  @Post('url')
  async fromUrl(@Body() body: { url: string; filename?: string }) {
    let source: URL;
    try { source = new URL(body.url); } catch { throw new BadRequestException('A valid http(s) URL is required'); }
    if (!['http:', 'https:'].includes(source.protocol)) throw new BadRequestException('Only http(s) URLs are supported');
    const key = `sources/${new Date().toISOString().slice(0,10)}/${randomUUID()}-${String(body.filename ?? source.pathname.split('/').pop() ?? 'source.zip').replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    const upload = await this.db.getRepository(EncUpload).save({ id: randomUUID(), uploadId: `url-${randomUUID()}`, objectKey: key, sourceFilename: body.filename ?? source.pathname.split('/').pop() ?? 'source.zip', expectedSize: null, sourceUrl: source.toString(), status: 'uploading', parts: [] });
    const ingestionId = randomUUID();
    await this.dispatcher.dispatch({ archivePath: '', ingestionId, versionId: randomUUID(), versionKey: `pending-${upload.id}`, objectKey: key, sourceUrl: source.toString(), sourceFilename: upload.sourceFilename });
    await this.db.getRepository(EncUpload).update(upload.id, { ingestionId, status: 'queued' });
    return { uploadId: upload.uploadId, objectKey: key, ingestionId, status: 'queued' };
  }
  @Post(':uploadId/parts/:partNumber/sign')
  async sign(@Param('uploadId') uploadId: string, @Param('partNumber') partNumber: string) {
    const upload = await this.db.getRepository(EncUpload).findOneByOrFail({ uploadId });
    return { uploadId, objectKey: upload.objectKey, partNumber: Number(partNumber), url: await this.storage.signPart(upload.objectKey, uploadId, Number(partNumber)) };
  }
  @Get(':uploadId') async progress(@Param('uploadId') uploadId: string) { return this.db.getRepository(EncUpload).findOneByOrFail({ uploadId }); }
  @Post(':uploadId/complete')
  async complete(@Param('uploadId') uploadId: string, @Body() body: { parts: { partNumber: number; etag: string; size?: number }[] }) {
    const repo = this.db.getRepository(EncUpload); const upload = await repo.findOneByOrFail({ uploadId });
    if (upload.status === 'queued' && upload.ingestionId) return { uploadId, objectKey: upload.objectKey, status: 'queued', parts: upload.parts };
    if (!body.parts?.length) throw new BadRequestException('At least one uploaded part is required');
    try { await this.storage.completeMultipart(upload.objectKey, uploadId, body.parts); }
    catch (error) { if (!await this.storage.tryHead(upload.objectKey)) throw error; }
    upload.parts = body.parts; upload.status = 'completed'; await repo.save(upload);
    const ingestionId = randomUUID();
    await this.dispatcher.dispatch({ archivePath: '', ingestionId, versionId: randomUUID(), versionKey: `pending-${upload.id}`, objectKey: upload.objectKey, sourceFilename: upload.sourceFilename, ...(upload.checksumSha256 ? { checksum: upload.checksumSha256 } : {}), ...(upload.expectedSize ? { sizeBytes: Number(upload.expectedSize) } : {}) });
    upload.ingestionId = ingestionId;
    await repo.save(upload);
    await repo.update(upload.id, { status: 'queued' });
    return { uploadId, objectKey: upload.objectKey, status: 'queued', parts: upload.parts };
  }
  @Delete(':uploadId')
  async abort(@Param('uploadId') uploadId: string) { const repo = this.db.getRepository(EncUpload); const upload = await repo.findOneByOrFail({ uploadId }); await this.storage.abortMultipart(upload.objectKey, uploadId); upload.status = 'aborted'; await repo.save(upload); return { uploadId, status: upload.status }; }
}
