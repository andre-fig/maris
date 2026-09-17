import path from 'node:path';

import {
  HttpException,
  Inject,
  Injectable,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import yauzl, { type Entry, type ZipFile } from 'yauzl';

import type { EncArchiveDto } from './dto/ingestion.dto.js';

type InspectOptions = {
  maxEntries: number;
  maxUncompressedBytes: number;
};

type MutableCell = {
  hasBase: boolean;
  updates: Set<number>;
};

const CELL_FILE_PATTERN = /^([A-Z0-9]{8})\.(\d{3})$/i;
const MAX_COMPRESSION_RATIO = 200;

function invalidEnc(code: string, message: string) {
  return new UnprocessableEntityException({ code, message, statusCode: 422 });
}

function openZip(archivePath: string) {
  return new Promise<ZipFile>((resolve, reject) => {
    yauzl.open(
      archivePath,
      { autoClose: true, decodeStrings: true, lazyEntries: true },
      (error, zipFile) => {
        if (error || !zipFile) {
          reject(
            invalidEnc(
              'INVALID_ZIP',
              error?.message ?? 'The uploaded file is not a readable ZIP archive',
            ),
          );
          return;
        }

        resolve(zipFile);
      },
    );
  });
}

function assertSafeEntry(entry: Entry) {
  const normalized = entry.fileName.replaceAll('\\', '/');
  const segments = normalized.split('/');

  if (
    normalized.includes('\0') ||
    normalized.startsWith('/') ||
    /^[A-Za-z]:/.test(normalized) ||
    segments.includes('..')
  ) {
    throw invalidEnc(
      'UNSAFE_ARCHIVE_PATH',
      `Unsafe path in archive: ${entry.fileName}`,
    );
  }

  if ((entry.generalPurposeBitFlag & 0x1) !== 0) {
    throw invalidEnc(
      'ENCRYPTED_ARCHIVE_ENTRY',
      `Encrypted entries are not supported: ${entry.fileName}`,
    );
  }
}

async function inspectEncArchive(
  archivePath: string,
  options: InspectOptions,
): Promise<EncArchiveDto> {
  const zipFile = await openZip(archivePath);

  return new Promise((resolve, reject) => {
    let settled = false;
    let entryCount = 0;
    let fileCount = 0;
    let compressedBytes = 0;
    let uncompressedBytes = 0;
    let catalogPresent = false;
    const cells = new Map<string, MutableCell>();

    const fail = (error: unknown) => {
      if (settled) {
        return;
      }

      settled = true;
      zipFile.close();
      reject(
        error instanceof HttpException
          ? error
          : invalidEnc('INVALID_ZIP', 'Could not inspect the ZIP archive'),
      );
    };

    zipFile.on('error', fail);
    zipFile.on('entry', (entry) => {
      try {
        entryCount += 1;
        if (entryCount > options.maxEntries) {
          throw invalidEnc(
            'TOO_MANY_ARCHIVE_ENTRIES',
            `Archive exceeds the ${options.maxEntries} entry limit`,
          );
        }

        assertSafeEntry(entry);

        if (entry.fileName.endsWith('/')) {
          zipFile.readEntry();
          return;
        }

        fileCount += 1;
        compressedBytes += entry.compressedSize;
        uncompressedBytes += entry.uncompressedSize;

        if (uncompressedBytes > options.maxUncompressedBytes) {
          throw invalidEnc(
            'ARCHIVE_TOO_LARGE_UNCOMPRESSED',
            `Archive expands beyond ${options.maxUncompressedBytes} bytes`,
          );
        }

        const basename = path.posix.basename(entry.fileName.replaceAll('\\', '/'));
        if (basename.toUpperCase() === 'CATALOG.031') {
          catalogPresent = true;
        }

        const match = CELL_FILE_PATTERN.exec(basename);
        if (match) {
          const [, rawName, rawExtension] = match;
          const name = rawName!.toUpperCase();
          const updateNumber = Number(rawExtension);
          const cell = cells.get(name) ?? { hasBase: false, updates: new Set<number>() };

          if (updateNumber === 0) {
            cell.hasBase = true;
          } else {
            cell.updates.add(updateNumber);
          }
          cells.set(name, cell);
        }

        zipFile.readEntry();
      } catch (error) {
        fail(error);
      }
    });

    zipFile.on('end', () => {
      if (settled) {
        return;
      }

      try {
        const compressedForRatio = Math.max(compressedBytes, 1);
        if (uncompressedBytes / compressedForRatio > MAX_COMPRESSION_RATIO) {
          throw invalidEnc(
            'SUSPICIOUS_COMPRESSION_RATIO',
            'Archive compression ratio exceeds the safety limit',
          );
        }

        const missingBases = [...cells.entries()]
          .filter(([, cell]) => !cell.hasBase)
          .map(([name]) => name);
        if (missingBases.length > 0) {
          throw invalidEnc(
            'MISSING_BASE_CELL',
            `Updates without matching .000 cells: ${missingBases.slice(0, 5).join(', ')}`,
          );
        }

        const completeCells = [...cells.entries()]
          .filter(([, cell]) => cell.hasBase)
          .map(([name, cell]) => ({
            name,
            updateNumbers: [...cell.updates].sort((left, right) => left - right),
          }))
          .sort((left, right) => left.name.localeCompare(right.name));

        if (completeCells.length === 0) {
          throw invalidEnc(
            'NO_S57_CELLS',
            'Archive must contain at least one S-57 .000 base cell',
          );
        }

        settled = true;
        resolve({
          catalogPresent,
          cellCount: completeCells.length,
          cells: completeCells,
          compressedBytes,
          entryCount,
          fileCount,
          uncompressedBytes,
        });
      } catch (error) {
        fail(error);
      }
    });

    zipFile.readEntry();
  });
}

@Injectable()
export class EncArchiveService {
  constructor(@Inject(ConfigService) private readonly config: ConfigService) {}

  inspect(archivePath: string) {
    return inspectEncArchive(archivePath, {
      maxEntries: this.config.getOrThrow<number>('MAX_ARCHIVE_ENTRIES'),
      maxUncompressedBytes: this.config.getOrThrow<number>('MAX_UNCOMPRESSED_BYTES'),
    });
  }
}
