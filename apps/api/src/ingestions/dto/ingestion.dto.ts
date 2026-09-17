export class EncCellDto {
  name!: string;
  updateNumbers!: number[];
}

export class EncArchiveDto {
  catalogPresent!: boolean;
  cellCount!: number;
  cells!: EncCellDto[];
  compressedBytes!: number;
  entryCount!: number;
  fileCount!: number;
  uncompressedBytes!: number;
}

export class IngestionChecksumDto {
  algorithm!: 'sha256';
  value!: string;
}

export class IngestionDto {
  archive!: EncArchiveDto;
  checksum!: IngestionChecksumDto;
  createdAt!: string;
  id!: string;
  originalFilename!: string;
  sizeBytes!: number;
  sourceType!: 'S57';
  status!: 'received';
  storagePath!: string;
}

export class UploadEncDto {
  file!: Express.Multer.File;
}
