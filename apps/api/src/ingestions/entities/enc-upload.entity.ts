import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity({ name: 'enc_uploads' })
@Index(['objectKey'], { unique: true })
export class EncUpload {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ name: 'upload_id', type: 'text', unique: true }) uploadId!: string;
  @Column({ name: 'object_key', type: 'text' }) objectKey!: string;
  @Column({ name: 'source_filename', type: 'text' }) sourceFilename!: string;
  @Column({ name: 'expected_size', type: 'bigint', nullable: true }) expectedSize!: string | null;
  @Column({ name: 'checksum_sha256', type: 'text', nullable: true }) checksumSha256!: string | null;
  @Column({ name: 'source_url', type: 'text', nullable: true }) sourceUrl!: string | null;
  @Column({ type: 'text', default: 'created' }) status!: 'created'|'uploading'|'completed'|'queued'|'failed'|'aborted';
  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" }) parts!: { partNumber: number; etag: string; size?: number }[];
  @Column({ name: 'ingestion_id', type: 'uuid', nullable: true }) ingestionId!: string | null;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
}
