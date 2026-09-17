export const CHART_STORAGE = Symbol('CHART_STORAGE');

export type VectorLayerManifest = {
  fields: Record<string, string>;
  id: string;
  maxzoom: number;
  minzoom: number;
};

export type TilesetManifest = {
  bounds: [number, number, number, number];
  createdAt: string;
  dataset: string;
  format: 'mvt';
  maxzoom: number;
  minzoom: number;
  name: string;
  tilePathTemplate: string;
  vectorLayers: VectorLayerManifest[];
  version: string;
};

export interface ChartStorage {
  getManifest(dataset: string, version: string): Promise<TilesetManifest>;
  getTileUrl(manifest: TilesetManifest, fallbackBaseUrl: string): string;
}
