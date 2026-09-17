import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { ConfigService } from '@nestjs/config';
import { EncProcessingService } from './enc-processing.service.js';

const cell = fileURLToPath(new URL('../../../../../data/ENC_ROOT/US5MIABC/US5MIABC.000', import.meta.url));

test('extracts real Miami S-57 coverage, dates, names, datums and spatial survey quality',
  { skip: !existsSync(cell) && 'Local ENC fixture not installed' }, async () => {
    const service = new EncProcessingService(new ConfigService({
      STORAGE_DIR: path.dirname(cell), CHART_STORAGE_DIR: path.dirname(cell),
    }));
    const result = await service.readCellMetadata(cell);
    assert.equal(result.edition, '2');
    assert.equal(result.updateNumber, 0);
    const metadata = result.metadata;
    assert.equal(metadata.source, 'NOAA');
    assert.equal(metadata.issueDate, '2025-09-03');
    assert.equal(metadata.updateApplicationDate, '2025-09-03');
    assert.equal(metadata.compilationScale, 22000);
    assert.equal(metadata.horizontalDatum, 2);
    assert.equal(metadata.soundingDatum, 12);
    assert.ok(metadata.coveredAreaNames.includes('Biscayne Bay'));
    assert.ok(metadata.coveredAreaNames.includes('Key Biscayne'));
    assert.equal(new Set(metadata.coveredAreaNames).size, metadata.coveredAreaNames.length);
    assert.ok(metadata.coverage.length > 0);
    assert.ok(metadata.coverage.every((feature) => feature.geometry && feature.properties.CATCOV));
    assert.ok(metadata.metaObjects.M_QUAL?.some((feature) => feature.properties.CATZOC === 3));
    assert.ok(metadata.metaObjects.M_QUAL?.some((feature) => feature.properties.SURSTA === '20080713'
      && feature.properties.SUREND === '20080826' && feature.properties.SORIND));
  });
