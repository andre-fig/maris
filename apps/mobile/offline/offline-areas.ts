import { OfflineManager, type OfflinePackProgressListener, type OfflinePackErrorListener } from '@maplibre/maplibre-react-native';
import { Directory, File, Paths } from 'expo-file-system';
import { validateArea, withOfflineSoundings, type AreaBounds, type ChartSnapshot, type StyleSnapshot } from './offline-style';

// This quota applies only to evictable resources, never to explicit packs.
export const MAP_AMBIENT_CACHE_BYTES = 256 * 1024 * 1024;
export const MAX_OFFLINE_PACKS = 5;
export const OFFLINE_DOWNLOAD_BUDGET_BYTES = 512 * 1024 * 1024;
const root = new Directory(Paths.document, 'offline-areas');
let downloading = false;

async function json<T>(url: string): Promise<T> {
  const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error(`Offline metadata: HTTP ${response.status}`);
  return response.json() as Promise<T>;
}

export async function downloadOfflineArea(options: {
  name: string; bounds: AreaBounds; minZoom: number; maxZoom: number;
  baseStyleUrl: string; apiUrl: string;
}, onProgress: OfflinePackProgressListener, onError: OfflinePackErrorListener) {
  validateArea(options.bounds, options.minZoom, options.maxZoom);
  if (downloading) throw new Error('Offline area preparation already running');
  downloading = true;
  let file: File | undefined;
  try {
    const packs = await OfflineManager.getPacks();
    if (packs.length >= MAX_OFFLINE_PACKS) throw new Error('Remove an offline area before downloading another');
    const statuses = await Promise.all(packs.map((pack) => pack.status()));
    if (statuses.some((status) => status.state === 'active')) throw new Error('Wait for the active offline download');
    const occupied = statuses.reduce((sum, status) => sum + status.completedResourceSize, 0);
    if (occupied >= OFFLINE_DOWNLOAD_BUDGET_BYTES || Paths.availableDiskSpace < 128 * 1024 * 1024) {
      throw new Error('Insufficient offline storage budget or free disk space');
    }
    const [style, chart] = await Promise.all([
      json<StyleSnapshot>(options.baseStyleUrl),
      json<ChartSnapshot>(`${options.apiUrl}/tiles/soundg.json`),
    ]);
    // Pin remote source catalogs (including the OpenFreeMap planet revision).
    for (const source of Object.values(style.sources)) {
      if (typeof source.url !== 'string') continue;
      const tilejson = await json<Record<string, unknown>>(source.url);
      delete source.url;
      Object.assign(source, tilejson);
    }
    root.create({ idempotent: true, intermediates: true });
    file = new File(root, `${Date.now()}-${chart.version}.json`);
    file.create({ overwrite: false });
    file.write(JSON.stringify(withOfflineSoundings(style, chart)));
    const pack = await OfflineManager.createPack({
      mapStyle: file.uri, bounds: options.bounds,
      minZoom: options.minZoom, maxZoom: options.maxZoom,
      metadata: { kind: 'maris-area-v1', name: options.name,
        chartVersion: chart.version, chart, baseStyle: style,
        styleUri: file.uri, createdAt: new Date().toISOString(),
        minZoom: options.minZoom, maxZoom: options.maxZoom },
    }, (pack, status) => {
      // Native accounting can overcount shared resources. Conservative budget;
      // callbacks are throttled, so this is a pause threshold, not a byte quota.
      if (occupied + status.completedResourceSize > OFFLINE_DOWNLOAD_BUDGET_BYTES && status.state !== 'complete') {
        void pack.pause().catch(() => {});
        onError(pack, { id: pack.id, message: 'Offline download budget exceeded; download paused' });
      }
      onProgress(pack, status);
    }, onError);
    file = undefined; // Ownership belongs to the persistent pack from now on.
    await pack.resume();
    return pack;
  } catch (error) {
    if (file?.exists) file.delete();
    throw error;
  } finally {
    downloading = false;
  }
}

export async function listOfflineAreas() {
  const packs = await OfflineManager.getPacks();
  return Promise.all(packs.filter((p) => p.metadata.kind === 'maris-area-v1')
    .map(async (pack) => ({ pack, status: await pack.status() })));
}

// Consumer can use the frozen base style and inline ENC tiles with the existing
// Map/VectorSource. No network lookup is needed, and no UI is added here.
export async function openOfflineArea(id: string) {
  const pack = await OfflineManager.getPack(id);
  if (pack.metadata.kind !== 'maris-area-v1' || (await pack.status()).state !== 'complete') {
    throw new Error('Offline area is not fully downloaded');
  }
  return { bounds: pack.bounds, baseStyle: pack.metadata.baseStyle as StyleSnapshot,
    chart: pack.metadata.chart as ChartSnapshot };
}

export async function removeOfflineArea(id: string) {
  const pack = await OfflineManager.getPack(id);
  if (pack.metadata.kind !== 'maris-area-v1') throw new Error('Unknown offline area');
  await OfflineManager.deletePack(id);
  const uri = pack.metadata.styleUri;
  if (typeof uri === 'string' && uri.startsWith(`${root.uri.replace(/\/$/, '')}/`)) {
    const file = new File(uri);
    if (file.exists) file.delete();
  }
}

// Updating uses downloadOfflineArea to create a new version first. An old pack
// is never deleted implicitly; it stays usable until explicitly removed.
