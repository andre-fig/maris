import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ChartCell } from '../ingestions/entities/chart-cell.entity.js';
import { ChartSurvey } from '../ingestions/entities/chart-survey.entity.js';
import { ChartVersion } from '../ingestions/entities/chart-version.entity.js';
import { CHART_STORAGE, type ChartStorage } from '../tiles/storage/chart-storage.js';
import { ChartQueryDto } from './dtos/chart-query.dto.js';
import type { ChartInformationDto } from './dtos/chart-information.dto.js';
import { ChartSelection, CHART_SELECTION_POLICY, coversPoint } from './models/chart-selection.js';

@Injectable()
export class ChartsService {
  constructor(
    @Inject(DataSource) private readonly database: DataSource,
    @Inject(CHART_STORAGE) private readonly storage: ChartStorage,
  ) {}

  async atPoint(query: ChartQueryDto): Promise<ChartInformationDto> {
    const version = await this.database.getRepository(ChartVersion).findOne({
      where: {
        status: 'published', dataset: { key: 'soundg' },
        ...(query.version ? { versionKey: query.version } : { active: true }),
      },
    });
    if (!version) throw new NotFoundException('Published chart version not found');
    const manifest = await this.storage.getManifest('soundg', version.versionKey);
    if (manifest.selectionPolicy !== CHART_SELECTION_POLICY) {
      throw new ConflictException('This legacy dataset has overlapping charts; update the chart dataset');
    }
    // Coverage metadata only. Never load the sounding GeoJSON or PMTiles here.
    const cells = await this.database.getRepository(ChartCell).find({
      where: { versionId: version.id }, relations: { coverages: true },
    });
    const coordinate: [number, number] = [query.lon, query.lat];
    const selected = new ChartSelection(cells).at(coordinate);
    const cell = selected && cells.find((c) => c.name === selected.name && c.edition === selected.edition && c.updateNumber === selected.updateNumber);
    if (!cell) throw new NotFoundException('No ENC coverage at this coordinate');
    const surveys = (await this.database.getRepository(ChartSurvey).find({
      where: { cellId: cell.id }, order: { objectClass: 'ASC', id: 'ASC' },
    })).filter((survey) => survey.geometry === null || coversPoint(survey.geometry, coordinate));
    return {
      id: cell.id, name: cell.name, source: cell.source, edition: cell.edition,
      updateNumber: cell.updateNumber, updatesApplied: cell.updatesApplied,
      issueDate: cell.issueDate, updateApplicationDate: cell.updateApplicationDate,
      compilationScale: cell.compilationScale, coveredAreaNames: cell.coveredAreaNames,
      horizontalDatum: cell.horizontalDatum, soundingDatum: cell.soundingDatum, verticalDatum: cell.verticalDatum,
      dataQuality: [...new Set(surveys.flatMap((s) => s.dataQuality === null ? [] : [s.dataQuality]))].sort(),
      surveys: surveys.map((s) => ({ objectClass: s.objectClass, source: s.surveySource, date: s.surveyDate, startedAt: s.surveyStartedAt, endedAt: s.surveyEndedAt })),
      version: version.versionKey, processedAt: version.processedAt?.toISOString() ?? null,
      publishedAt: version.publishedAt?.toISOString() ?? null, coordinate,
    };
  }
}
