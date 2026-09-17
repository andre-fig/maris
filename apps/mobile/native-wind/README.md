# Native wind — first implementation

This package draws **inside MapLibre's render pass**, not in its React Native view.
The zero-sized `MarisWindControl` view only attaches/configures the native layer.
No Skia, WebView, JS camera loop or JS particle loop is used.

## Code

| Responsibility | Implementation |
|---|---|
| RN controls | `index.tsx`: enabled, opacity, density (0–1), animationSpeed |
| iOS | `ios/MarisWind.mm`: `MLNCustomStyleLayer`, Metal encoder, NSURLSession/ImageIO, native display link |
| Android | `android/WindJNI.cpp`: `CustomLayerHost`, GLES3 resources, JNI handles |
| Android lifecycle/transport | `WindControl.java`: MapLibre attachment, OkHttp, bitmap decoding, Choreographer |
| Shared | `cpp/WindCore.hpp`: tile addressing, atlas, bounded decoded cache, bilinear sampling, Mercator/projection, RK2 advection, particle ring buffers, adaptive-density inputs, render metrics |
| GPU programs | `cpp/WindShaders.hpp`: common gradient, MSL and GLES shader wrappers |

Pinned integration: MapLibre RN 11.3.10, iOS Native 6.26.0 (Metal), Android Native
13.2.0 (`android-sdk-opengl`). Android's experimental host ABI is reproduced in
`MapLibreCustomHost.hpp`; do not upgrade the SDK without checking that contract.
The Java CustomLayer owns the host pointer. Registry removal only releases a
shared state reference, never deletes the host twice.

## Data and rendering

1. Native worker fetches `https://beta.yr-maps.met.no/api/wind/available.json`
   with `User-Agent: Maris/1.0 (https://github.com/andre-fig/maris)`.
2. Uses the first available valid time, and its revision/time-qualified PNG URL.
   Tile selection uses native viewport bounds plus a one-tile margin, maximum
   source zoom 6. The atlas is capped at 2048 pixels per dimension by reducing
   source zoom. No full-region/global dataset download.
3. PNGs are 256×256; the observed MET files contain **16-bit RGB**. Platform
   decoders convert to RGBA8 before composition. Android explicitly converts
   RGBA_F16 bitmaps; a preferred bitmap config alone is insufficient.
4. A single contiguous native atlas contains raw R/G, not precolored pixels.
   Missing pixels have alpha zero. Adjacent tiles share the same bilinear
   sampling domain; no per-tile clamped texture borders.
5. GPU shaders compute `(rg * 255 - 128) / 2` and `length(direction)`, then
   interpolate NRK's ten color stops. R positive means eastward, G positive
   northward; Mercator Y grows southward. Textures use **UNORM**, not sRGB.
6. Heat pass uses premultiplied output and destination-color blending:
   `map * (1 - opacity + opacity * windColor)`. At opacity 1 this matches the
   reference multiplication. Our unchanged colored basemap makes the final
   colors different from Yr's neutral basemap.
7. Native double-precision projection uses the matrix supplied for that exact
   render frame, in world units `512 * 2^zoom`. Clip XYZW plus atlas UVs are
   passed to GPU, preserving perspective interpolation, pitch and bearing.
   The RN bridge does not synchronize camera frames.
8. Shared C++ particles bilinearly sample the same raw atlas, integrate with
   midpoint/RK2, respawn in the visible geographic envelope, and fade with a
   randomized 2–5 second lifetime. Trails retain 75 geographic positions in
   fixed ring buffers. Trails use screen-space triangle ribbons, 5 physical
   pixels wide on both platforms (`trailWidthPixels`), independent of zoom/pitch.
   Simulation is **CPU native**, drawing is GPU; this is
   not a GPU-compute implementation. Speed is visual: 4 map pixels/s per m/s
   at animationSpeed 1, not physical parcel travel time. Density adapts down
   when render intervals exceed 35 ms; the app uses density 0.75 (up to 750 particles).
   Local particle visibility additionally follows decoded wind magnitude:
   below 1.1 m/s: 0%; 1.1–2.2: 20%; 2.2–3.3: 40%; 3.3–4.4: 60%;
   4.4–5.5: 80%; at least 5.5: 100% (lower bounds inclusive).
   Five stable particle groups apply these fractions without redistributing
   hidden candidates to windy areas. Hidden trails reset; lifetimes/advection
   continue. The animation-speed multiplier does not affect these thresholds.

The layer is inserted below the existing SOUNDG text layer when available.

The native control samples the published atlas on `sampleCoordinate` changes,
and again when a field load finishes, emitting `onCenterWind` with speed in m/s
and the queried coordinate, or null speed for missing data. There is no periodic
legend sampling. The coordinate comes directly from MapLibre's camera-changing
events, including while the finger is down and during inertia. No debounce or
predicted destination is used for the wind highlight. The weather request policy
is independent and unchanged. Responses for obsolete points are ignored.
Both platforms use shared bilinear sampling and dateline wrapping. The legend
highlights the matching lower-bound interval without fetching additional data;
closing/reopening clears the selection until the next native sample. During
atlas transitions the selection uses the newly published field.
`components/WindPanel.tsx` adds the wind toggle above the compass, using the
shared BlurPanel, text and icon sizing. It starts collapsed/disabled, expands
upward to show the NRK wind-speed legend in m/s, and collapses/disables on the
next tap. The header uses SF Symbol `wind` on iOS and Material Symbol `air` on
Android. Enabled wind opacity is 0.75. Existing map sources, ENC data, GPS,
compass actions and weather logic are unchanged.

## Requests, cache and lifecycle

- Shared C++ decoded LRU: 32 tiles / approximately 8 MiB, keyed by full versioned URL.
- Native HTTP disk cache: 32 MiB (NSURLCache / OkHttp), respects response headers.
- The last valid catalog is persisted beside the field snapshots and can provide
  versioned tile URLs while MET is unavailable; normal native HTTP caching still
  allows missing tiles to download when connectivity returns.
- Four complete persistent field snapshots are retained in a rotating ring;
  an individual field is capped at 16 MiB, for a maximum of approximately 64 MiB
  plus metadata.
- One serial worker per attached control, unchanged viewport plan deduplicated;
  requests from older viewport generations are cancelled at the HTTP layer.
- Successful loads are rechecked after 60 seconds; failed, partial or persisted-
  catalog loads retry 5 seconds after completion even with a stationary camera.
  The same plan cannot restart while in flight. After the first tile request
  failure, remaining cache misses wait for the next attempt rather than stacking
  network timeouts; decoded cache hits can still be composed.
- Cached decoded tiles avoid repeat download
  and decoding. A new plan cancels queued generations logically; one ongoing
  HTTP request can finish, but its stale field is never published.
- Complete staging atlas is published in one swap. Failed tiles stay transparent;
  no made-up wind and no interpolation across missing pixels.
- Restored fields and fields assembled with the persisted catalog report stale
  internally; no status notice is displayed in the app.
- Disabled, zero-opacity and background layers stop rendering and invalidate
  publication. Native clocks still perform a lightweight visibility check.
- Reattachment/style reload/context loss recreates GPU resources; decoded cache
  survives layer recreation. Older fields are kept while a replacement loads.

## Build / test

Run the normal workspace install, then rebuild the native apps (hot reload alone
cannot install the module). iOS requires `pod install` after adding this package;
Android requires NDK 27.1.12297006 and CMake 3.22.1.

From the repository root:

```sh
pnpm --filter @maris/mobile typecheck
cmake -S apps/mobile/native-wind/cpp -B artifacts/native-wind-tests
cmake --build artifacts/native-wind-tests
ctest --test-dir artifacts/native-wind-tests --output-on-failure
```

The C++ tests cover Mercator/projection, antimeridian tile addressing, a tile
seam, absent data, cache revision isolation and eviction, direction of particle
advection, lifetime alpha bounds and disabling particles. Also run successfully
with Clang AddressSanitizer and UndefinedBehaviorSanitizer.

Debug-only camera fixtures, opt-in and never used during a normal launch:

```sh
SIMCTL_CHILD_MARIS_WIND_CAMERA='-80.19,25.76,5,40,45' xcrun simctl launch booted com.maris.navigation
adb shell am start -n com.maris.navigation/.MainActivity --es maris.wind.camera '-80.19,25.76,5,40,45'
```

Values are longitude,latitude,zoom,bearing,pitch. Apply after startup settles;
terminate the running app before each fixture. Normal launches still use GPS.
Debug builds log native render-callback rate and layer CPU encoding time every
five seconds. On iOS Release opt in with `MARIS_WIND_METRICS=1` at launch.

## Validation and remaining work

See `docs/native-wind-validation.md` at the repository root for actual runs,
measurements and limitations. This is a working first implementation, **not**
production certification or pixel-identical Yr rendering.

Reference mathematics/gradient: https://github.com/nrkno/yr-map-docs (MIT,
notice in LICENSE-NRK). That repository documents the static heatmap, not its
live site's particle engine. Our particles are original code.
MET encoding: https://prod.yr-maps.met.no/concepts .
