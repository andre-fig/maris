export const INGESTION_STATUSES = [
  'received',
  'validating',
  'processing',
  'ready',
  'failed',
  'published',
] as const;

export type IngestionStatus = (typeof INGESTION_STATUSES)[number];

export type ProcessedCell = {
  edition: string | null;
  name: string;
  updateNumber: number;
  updatesApplied: number[];
};

export type ProcessingResult = {
  bounds: [number, number, number, number];
  cells: ProcessedCell[];
  manifestPath: string;
  storagePath: string;
};

export type ProcessingJob = {
  archivePath: string;
  ingestionId: string;
  versionId: string;
  versionKey: string;
};
