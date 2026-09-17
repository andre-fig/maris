export type EncCellSummary = {
  name: string;
  updateNumbers: number[];
};

export type EncArchiveSummary = {
  catalogPresent: boolean;
  cellCount: number;
  cells: EncCellSummary[];
  compressedBytes: number;
  entryCount: number;
  fileCount: number;
  uncompressedBytes: number;
};

export type IngestionManifest = {
  archive: EncArchiveSummary;
  checksum: {
    algorithm: 'sha256';
    value: string;
  };
  createdAt: string;
  id: string;
  originalFilename: string;
  sizeBytes: number;
  sourceType: 'S57';
  status: 'received';
  storagePath: string;
};
