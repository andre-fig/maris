import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AbortMultipartUploadCommand, CompleteMultipartUploadCommand, CreateMultipartUploadCommand,
  GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client, UploadPartCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createWriteStream } from 'node:fs';
import { createReadStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';

export type MultipartPart = { partNumber: number; etag: string };

@Injectable()
export class ObjectStorageService {
  private readonly client: S3Client | null;
  private readonly bucket: string;
  constructor(config: ConfigService) {
    this.bucket = config.get<string>('ENC_S3_BUCKET', '');
    const endpoint = config.get<string>('ENC_S3_ENDPOINT', '');
    const accessKeyId = config.get<string>('ENC_S3_ACCESS_KEY_ID', '');
    const secretAccessKey = config.get<string>('ENC_S3_SECRET_ACCESS_KEY', '');
    this.client = endpoint && accessKeyId && secretAccessKey ? new S3Client({
      endpoint, region: config.get<string>('ENC_S3_REGION', 'auto'), forcePathStyle: false,
      credentials: { accessKeyId, secretAccessKey },
    }) : null;
  }
  private requireClient() { if (!this.client || !this.bucket) throw new Error('S3 object storage is not configured'); return this.client; }
  async createMultipart(key: string, contentType = 'application/zip') {
    const result = await this.requireClient().send(new CreateMultipartUploadCommand({ Bucket: this.bucket, Key: key, ContentType: contentType }));
    if (!result.UploadId) throw new Error('S3 did not return an upload id');
    return { uploadId: result.UploadId, key };
  }
  async signPart(key: string, uploadId: string, partNumber: number, expiresIn = 900) {
    return getSignedUrl(this.requireClient(), new UploadPartCommand({ Bucket: this.bucket, Key: key, UploadId: uploadId, PartNumber: partNumber }), { expiresIn });
  }
  async completeMultipart(key: string, uploadId: string, parts: MultipartPart[]) {
    return this.requireClient().send(new CompleteMultipartUploadCommand({ Bucket: this.bucket, Key: key, UploadId: uploadId, MultipartUpload: { Parts: parts.sort((a,b) => a.partNumber-b.partNumber).map(p => ({ PartNumber: p.partNumber, ETag: p.etag })) } }));
  }
  async abortMultipart(key: string, uploadId: string) { await this.requireClient().send(new AbortMultipartUploadCommand({ Bucket: this.bucket, Key: key, UploadId: uploadId })); }
  async downloadToFile(key: string, destination: string) {
    const response = await this.requireClient().send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    if (!response.Body) throw new Error('S3 object has no body');
    await pipeline(Readable.fromWeb(response.Body as never), createWriteStream(destination));
  }
  async head(key: string) { return this.requireClient().send(new HeadObjectCommand({ Bucket: this.bucket, Key: key })); }
  async tryHead(key: string) {
    try { return await this.head(key); } catch (error) {
      const code = (error as { name?: string; $metadata?: { httpStatusCode?: number } }).name;
      const status = (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
      if (code === 'NotFound' || code === 'NoSuchKey' || status === 404) return null;
      throw error;
    }
  }
  async downloadToFileWithMetadata(key: string, destination: string) { const head = await this.head(key); await this.downloadToFile(key, destination); return { size: Number(head.ContentLength ?? 0), checksum: head.Metadata?.sha256 ?? null }; }
  async presignDownload(key: string, expiresIn = 900) { return getSignedUrl(this.requireClient(), new GetObjectCommand({ Bucket: this.bucket, Key: key }), { expiresIn }); }
  async putStream(key: string, body: ReadableStream<Uint8Array> | Uint8Array, contentType = 'application/zip') { await this.requireClient().send(new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body as never, ContentType: contentType })); return key; }
  async putUrl(key: string, url: string, contentType = 'application/zip') {
    const response = await fetch(url, { headers: { 'User-Agent': 'Maris ENC importer/1.0 (+https://maris-navigation.app)' } });
    if (!response.ok || !response.body) throw new Error(`Source download failed with HTTP ${response.status}`);
    await this.putStream(key, response.body, contentType);
    return { key, size: Number(response.headers.get('content-length') ?? 0) || null };
  }
  async putFile(key: string, file: string, contentType = 'application/octet-stream') { await this.requireClient().send(new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: createReadStream(file), ContentType: contentType })); return this.head(key); }
}
