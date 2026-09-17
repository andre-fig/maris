import {
  Inject,
  Injectable,
  OnApplicationShutdown,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  Pool,
  type PoolClient,
  type QueryResult,
  type QueryResultRow,
} from 'pg';

export const CHART_CATALOG_MIGRATION = `
CREATE TABLE IF NOT EXISTS chart_datasets (
  id uuid PRIMARY KEY,
  key text NOT NULL UNIQUE,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS chart_ingestions (
  id uuid PRIMARY KEY,
  dataset_id uuid NOT NULL REFERENCES chart_datasets(id),
  status text NOT NULL CHECK (status IN ('received', 'validating', 'processing', 'ready', 'failed', 'published')),
  source_filename text,
  checksum_sha256 text,
  source_size_bytes bigint,
  archive_storage_path text,
  source_cells jsonb NOT NULL DEFAULT '[]'::jsonb,
  error_message text,
  error_stack text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  processing_started_at timestamptz,
  processed_at timestamptz,
  published_at timestamptz
);

CREATE TABLE IF NOT EXISTS chart_versions (
  id uuid PRIMARY KEY,
  ingestion_id uuid NOT NULL UNIQUE REFERENCES chart_ingestions(id),
  dataset_id uuid NOT NULL REFERENCES chart_datasets(id),
  version_key text NOT NULL,
  status text NOT NULL CHECK (status IN ('received', 'validating', 'processing', 'ready', 'failed', 'published')),
  edition_metadata jsonb NOT NULL DEFAULT '[]'::jsonb,
  update_number integer,
  bounds jsonb,
  storage_path text,
  manifest_path text,
  active boolean NOT NULL DEFAULT false,
  error_message text,
  error_stack text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  published_at timestamptz,
  UNIQUE(dataset_id, version_key)
);

CREATE UNIQUE INDEX IF NOT EXISTS chart_versions_one_active_per_dataset
  ON chart_versions(dataset_id) WHERE active;

INSERT INTO chart_datasets (id, key, name)
VALUES ('00000000-0000-4000-8000-000000000001', 'soundg', 'Miami SOUNDG')
ON CONFLICT (key) DO NOTHING;

INSERT INTO chart_ingestions (
  id, dataset_id, status, source_filename, source_cells, processed_at, published_at
)
VALUES (
  '00000000-0000-4000-8000-000000000011',
  (SELECT id FROM chart_datasets WHERE key = 'soundg'),
  'published', 'legacy-import-v1', '[]'::jsonb, now(), now()
), (
  '00000000-0000-4000-8000-000000000012',
  (SELECT id FROM chart_datasets WHERE key = 'soundg'),
  'published', 'legacy-import-v2', '[]'::jsonb, now(), now()
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO chart_versions (
  id, ingestion_id, dataset_id, version_key, status, bounds,
  storage_path, manifest_path, active, processed_at, published_at
)
VALUES (
  '00000000-0000-4000-8000-000000000021',
  '00000000-0000-4000-8000-000000000011',
  (SELECT id FROM chart_datasets WHERE key = 'soundg'),
  'miami-soundg-v1', 'published', '[-80.265019,25.650179,-80.026909,25.949411]'::jsonb,
  'soundg/versions/miami-soundg-v1',
  'soundg/versions/miami-soundg-v1/manifest.json', false, now(), now()
), (
  '00000000-0000-4000-8000-000000000022',
  '00000000-0000-4000-8000-000000000012',
  (SELECT id FROM chart_datasets WHERE key = 'soundg'),
  'miami-soundg-v2', 'published', '[-80.265019,25.650179,-80.026909,25.949411]'::jsonb,
  'soundg/versions/miami-soundg-v2',
  'soundg/versions/miami-soundg-v2/manifest.json', true, now(), now()
)
ON CONFLICT (id) DO NOTHING;
`;

@Injectable()
export class DatabaseService implements OnModuleInit, OnApplicationShutdown {
  private readonly pool: Pool | null;

  constructor(@Inject(ConfigService) config: ConfigService) {
    const databaseUrl = config.get<string>('DATABASE_URL');
    this.pool = databaseUrl
      ? new Pool({ connectionString: databaseUrl, max: 5 })
      : null;
  }

  async onModuleInit() {
    if (this.pool) {
      await this.pool.query('select 1');
      await this.pool.query(CHART_CATALOG_MIGRATION);
    }
  }

  async onApplicationShutdown() {
    await this.pool?.end();
  }

  async check() {
    if (!this.pool) return 'disabled' as const;
    try {
      await this.pool.query('select 1');
      return 'up' as const;
    } catch {
      return 'down' as const;
    }
  }

  isEnabled() {
    return this.pool !== null;
  }

  async query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    values: unknown[] = [],
  ): Promise<QueryResult<T>> {
    if (!this.pool) throw new Error('DATABASE_URL is required');
    return this.pool.query<T>(text, values);
  }

  async transaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
    if (!this.pool) throw new Error('DATABASE_URL is required');
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await work(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}
