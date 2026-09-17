import path from 'node:path';

export const API_CONFIG = Symbol('API_CONFIG');

export type ApiConfig = {
  databaseUrl: string | null;
  host: string;
  maxArchiveEntries: number;
  maxUncompressedBytes: number;
  maxUploadBytes: number;
  port: number;
  storageDirectory: string;
};

function positiveInteger(value: string | undefined, fallback: number, name: string) {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return parsed;
}

export function loadConfig(environment: NodeJS.ProcessEnv = process.env): ApiConfig {
  return {
    databaseUrl: environment.DATABASE_URL ?? null,
    host: environment.HOST ?? '0.0.0.0',
    maxArchiveEntries: positiveInteger(environment.MAX_ARCHIVE_ENTRIES, 10_000, 'MAX_ARCHIVE_ENTRIES'),
    maxUncompressedBytes: positiveInteger(environment.MAX_UNCOMPRESSED_BYTES, 2 * 1024 * 1024 * 1024, 'MAX_UNCOMPRESSED_BYTES'),
    maxUploadBytes: positiveInteger(environment.MAX_UPLOAD_BYTES, 256 * 1024 * 1024, 'MAX_UPLOAD_BYTES'),
    port: positiveInteger(environment.PORT, 3001, 'PORT'),
    storageDirectory: path.resolve(environment.STORAGE_DIR ?? '.storage'),
  };
}
