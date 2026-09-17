// Device-only integration fixture. Not imported by the production app.
// Run in a development build with an EXISTING disposable test area ID.
// TileJSON metadata is mocked for v2/v3; tiles themselves are real NOAA PBFs.
import { OfflineManager } from "@maplibre/maplibre-react-native";
import { offlineAreas } from "./offline-areas";
import { activeAreas } from "./offline-engine";

export async function validateNativeOfflineUpdateAndRemoval(
  areaId: string,
  apiUrl: string,
  baseStyleUrl: string,
) {
  const old = activeAreas(await offlineAreas.list()).find(
    (r) => r.areaId === areaId,
  );
  if (!old) throw new Error("Disposable test area not found");
  const fetchBefore = globalThis.fetch;
  let phase: "v2" | "failure" = "v2";
  const prefix = `offline-qa-${Date.now()}`;
  globalThis.fetch = async (input, init) => {
    if (String(input) !== `${apiUrl}/tiles/soundg.json`)
      return fetchBefore(input, init);
    const response = await fetchBefore(input, init);
    const chart = await response.json();
    const version = `${prefix}-${phase}`;
    return new Response(
      JSON.stringify({
        ...chart,
        version,
        tiles: chart.tiles.map((url: string) =>
          phase === "v2"
            ? `${url}?offline_qa=/${version}/`
            : `https://127.0.0.1:1/${version}/{z}/{x}/{y}.pbf`,
        ),
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  };
  const options = {
    areaId,
    name: old.name,
    bounds: old.bounds,
    minZoom: old.minZoom,
    maxZoom: old.maxZoom,
    apiUrl,
    baseStyleUrl,
  };
  try {
    const updated = await offlineAreas.download(options, () => {});
    if (
      activeAreas(await offlineAreas.list()).find((r) => r.areaId === areaId)
        ?.id !== updated.id
    )
      throw Error("v2 not published");
    for (const id of old.packs)
      if (
        (await (await OfflineManager.getPack(id)).status()).state !== "complete"
      )
        throw Error("Old pack lost");
    phase = "failure";
    let failed = false;
    try {
      await offlineAreas.download(options, () => {});
    } catch {
      failed = true;
    }
    if (
      !failed ||
      activeAreas(await offlineAreas.list()).find((r) => r.areaId === areaId)
        ?.id !== updated.id
    )
      throw Error("Failed update replaced active revision");
    await offlineAreas.remove(areaId);
    if (
      (await OfflineManager.getPacks()).some(
        (p) => p.metadata.areaId === areaId,
      )
    )
      throw Error("Native packs were not removed");
    console.info(
      "OFFLINE_NATIVE_QA_PASS: native v2 publication, old packs retained, failed v3 preserves v2, all test packs removed",
    );
  } finally {
    globalThis.fetch = fetchBefore;
  }
}
