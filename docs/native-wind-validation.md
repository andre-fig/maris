# Native wind: implementation validation

Date: 2026-09-17. Branch: `native-wind-architecture`.
Implementation: `apps/mobile/native-wind`.

## Actually executed

- iOS simulator build, install and runtime shader compilation: passed.
- iPhone 17 Pro Max: signed Release installed, launched without Metro; real MET
  tiles loaded and native render callbacks/particle vertices logged.
- Android arm64 API 35 emulator: build, install, GLES shader compilation and
  real MET atlas/particle rendering passed. Initial build also compiled all four
  Android ABIs. **No physical Android benchmark** was available.
- TypeScript check and host C++ tests passed. AddressSanitizer and
  UndefinedBehaviorSanitizer passed after fixing the end-of-lifetime alpha clamp.
- Static field inspected first with density zero, then particle rendering enabled.
- Miami close-up and zoom 5, plus bearing 40°/pitch 45° fixtures were inspected.
  SOUNDG stays above the field when its layer is present. Static field and trails
  use the map's frame matrix, including perspective, not delayed JS events.

Local screenshots (ignored artifacts, not bundled data):

- `artifacts/native-wind/ios-miami.png`
- `artifacts/native-wind/android-miami.png`
- `artifacts/native-wind/yr-miami-reference.png`
- `artifacts/native-wind/ios-pitch45-bearing40.png`
- `artifacts/native-wind/android-pitch45-bearing40.png`

Yr was opened in Chromium at its real Miami wind page. Its map was set to
center `[-80.19,25.76]`, zoom 5, bearing/pitch zero, with a 440×956 browser
viewport, matching the iOS simulator's logical screen dimensions. Geographic
coverage and main flow directions were compared. This is **not** a pixel-diff
test: basemaps, overlays and forecast revision selection are not locked to an
identical captured dataset. Yr's particle engine is also different.

## Observed measurements (not a controlled benchmark)

`callbacks/s` counts calls to the custom native layer; it is **not** a measured
display-present FPS counter. CPU time measures this layer's native simulation
and command encoding, excluding GPU execution, map rendering and network work.
Do not interpret total process memory as incremental wind overhead.

| Run | Render callbacks/s | Layer CPU/call | Memory | Loading |
|---|---:|---:|---|---|
| iPhone 17 Pro Max, Release, foreground stabilized | 60.0 | 0.346–0.371 ms | 768×768 RGBA atlas: 2.25 MiB CPU, same texture size on GPU; process footprint not measured in this run | first observed load 3.31 s, return from background 0.91 s |
| iOS simulator, Debug, zoom 5 | 60.0 | approximately 2.1–2.5 ms | measured process footprint 180–198 MiB; 1024×1280 atlas: 5 MiB CPU plus GPU texture | warm atlas load 0.12 s |
| Android API 35 arm64 emulator, Debug, host GPU, zoom 5 | observed 33–57; earlier concurrent-build intervals dropped lower | 1.24–1.78 ms in the sampled stable windows | measured total PSS 313868 KiB, RSS 430212 KiB; atlas 5 MiB CPU plus GPU texture | first Android uncached close-up load 2.51 s; cached plan loads tens of ms plus catalog latency |

The first Android run used an AVD with GPU disabled and yielded only ~4
callbacks/s. It was restarted with `-gpu host`; that software-rendered run must
not be used as a mobile GPU benchmark. Both emulators shared a Mac with builds
and browser tests, so these numbers are diagnostic only.

An Instruments Game Performance attachment was attempted on the physical
iPhone but did not finish recording; export reported `Document Missing Template
Error`. **No GPU timing/utilization or display-present FPS is claimed.**
The iPhone disconnected later. The final source (opacity propagation, extra
memory instrumentation and delayed debug camera fixture) compiled for generic
iOS, but could not be reinstalled after that disconnect. The previous Release
with the same native field/particle renderer remains the tested physical build.

## Objective comparison with the reference

| Part | Yr reference | This implementation |
|---|---|---|
| Field | Stitched raw MET tiles | Native contiguous viewport atlas, validity alpha, one-tile margin |
| Decode | `(rg*255-128)/2` | Same formula in MSL/GLES; shared C++ sampling for simulation |
| Magnitude | Euclidean vector length | `length(direction)` |
| Gradient | Ten color stops through a gradient texture | Same stops, continuous shader interpolation |
| Blending | Multiply wind color by background | Equivalent multiplication at opacity 1; configurable interpolation with unchanged basemap |
| Camera | Web map transform | Exact native frame projection matrix, CPU double precision to clip coordinates |
| Tile edges | Stitched texture | One bilinearly sampled atlas; no independent tile clamp seams |
| Animation | Not included in yr-map-docs; live site has dense streamlines | Original RK2 particles, ring-buffer trails, lifetime/respawn/fade, adaptive density |
| CPU/JS | Browser implementation | No JS frame work; C++ native advection, native loading, GPU draw |

## Still open

The repeatable Android physical benchmark runner is
`apps/mobile/scripts/benchmark-android-wind.sh`. It enables the wind layer via
an explicit benchmark intent, performs prolonged pan/zoom input, and captures
`gfxinfo` frame stats, CPU, PSS/RSS, thermal service and batterystats. It must
be run with a connected intermediate/low-end physical Android device; the
repository currently contains no physical Android result.

- Our trails are visibly thinner, shorter and less dense than the live Yr site.
  This implementation does not claim visual parity or production certification.
- A controlled, recorded pan/zoom/rotate performance suite, including map-only
  baseline and physical Android, remains to be run. Screenshots establish
  rendering, not proof of perfect behavior during every camera movement.
- GPU timings, sustained thermal/power behavior, process CPU percentage and
  incremental wind memory overhead remain unmeasured.
- Simulation is native CPU, not GPU compute. iOS creates a Metal vertex buffer
  per particle frame; reuse with safe in-flight synchronization remains work.
- HTTP loading is serial. The shared decoded LRU removes redundant downloads
  for cached tiles; active obsolete HTTP calls may finish before cancellation is
  observed. Transport/PNG decoding remain separate native platform adapters.
- Native decoders currently reduce 16-bit PNG components to RGBA8, matching the
  reference's 8-bit shader encoding but losing sub-byte precision. Embedded
  color-profile variants and alternate MET formats need explicit fixtures.
- Source maximum zoom is pinned to the documented/current MET maximum (6).
  The beta endpoint and experimental custom-layer APIs need ongoing compatibility
  checks. No offline product feature or missing-tile fabrication was added.
- Automated app-level lifecycle/context-loss stress tests and exact frozen-data
  visual regression tests remain future validation work.

No existing todo item was marked completed.
