import { OfflineManager } from "@maplibre/maplibre-react-native";
import { Directory, File, Paths } from "expo-file-system";
import { Platform } from "react-native";
import { OfflineAreas, type AreaRevision } from "./offline-engine";
export { MAP_AMBIENT_CACHE_BYTES } from "./offline-engine";
const root = new Directory(Paths.document, "offline-areas");
let sequence = 0;
root.create({ idempotent: true, intermediates: true });

// Append-only journal + rename: a crash cannot truncate a published revision.
export const offlineAreas = new OfflineAreas({
  packs: () => OfflineManager.getPacks(),
  create: (mapStyle, options, metadata, progress, error) =>
    OfflineManager.createPack(
      {
        mapStyle,
        bounds: options.bounds,
        minZoom: options.minZoom,
        maxZoom: options.maxZoom,
        metadata,
      },
      (_, status) => progress(status),
      (_, failure) => error(failure.message),
    ),
  remove: (id) => OfflineManager.deletePack(id),
  reclaim: () => OfflineManager.clearAmbientCache(),
  unlisten: (id) => OfflineManager.removeListener(id),
  async read() {
    const revisions = new Map<string, AreaRevision>();
    for (const file of root
      .list()
      .filter(
        (file): file is File =>
          file instanceof File && file.name.endsWith(".record.json"),
      )
      .sort((a, b) => a.name.localeCompare(b.name))) {
      try {
        const record = JSON.parse(await file.text()) as AreaRevision;
        revisions.set(record.id, record);
      } catch {
        /* Ignore interrupted, non-published journal entries. */
      }
    }
    return [...revisions.values()];
  },
  async save(record) {
    const name = `${Date.now()}-${String(sequence++).padStart(8, "0")}-${record.id}`;
    const temporary = new File(root, `${name}.tmp`);
    temporary.write(JSON.stringify(record));
    await temporary.move(new File(root, `${name}.record.json`));
  },
  async style(id, style) {
    const file = new File(root, `${id}.style.json`);
    file.create({ overwrite: false });
    file.write(JSON.stringify(style));
    return Platform.OS === "android"
      ? `https://offline.maris.invalid/${file.name}`
      : file.uri;
  },
  async deleteStyle(uri) {
    const local = uri.startsWith("https://offline.maris.invalid/")
      ? new File(root, uri.split("/").at(-1)!)
      : new File(uri);
    if (local.uri.startsWith(root.uri) && local.exists) local.delete();
  },
  async json<T>(url: string): Promise<T> {
    const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!response.ok)
      throw new Error(`Metadata offline: HTTP ${response.status}`);
    return response.json();
  },
  freeDisk: () => Paths.availableDiskSpace,
});
