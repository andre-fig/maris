# Native wind — first implementation

This package draws **inside MapLibre's render pass**, not in its React Native view.
The zero-sized `MarisWindControl` view only attaches/configures the native layer.
No Skia, WebView, JS camera loop or JS particle loop is used.

## Code

| Responsibility | Implementation |
|---|---|
| RN controls | `index.tsx`: enabled, opacity, density (0–1), animationSpeed |
| iOS | `ios/MarisWind.mm`: `MLNCustomStyleLayer`, Metal encoder, native display link |
| Android | `android/WindJNI.cpp`: `CustomLayerHost`, GLES3 resources, JNI handles |
| Android lifecycle/transport | `WindControl.java`: MapLibre attachment, GFS-grid bridge, Choreographer |
| Shared | `cpp/WindCore.hpp`: normalized GFS vector-grid bilinear sampling, Mercator/projection, RK2 advection, particle ring buffers, adaptive-density inputs, render metrics |
| GPU programs | `cpp/WindShaders.hpp`: common gradient, MSL and GLES shader wrappers |

Pinned integration: MapLibre RN 11.3.10, iOS Native 6.26.0 (Metal), Android Native
13.2.0 (`android-sdk-opengl`). Android's experimental host ABI is reproduced in
`MapLibreCustomHost.hpp`; do not upgrade the SDK without checking that contract.
The Java CustomLayer owns the host pointer. Registry removal only releases a
shared state reference, never deletes the host twice.

## Data and rendering

1. The mobile GFS client fetches and caches `/weather/gfs` grids. It passes the
   same normalized `windU`/`windV` arrays used by the HUD to the native layer
   once per run/forecast/bounds/grid change. Native performs no weather request.
2. The native layer retains the grid in a C++ `Field`; each particle samples
   the resident field with bilinear interpolation. No PNG atlas is involved in
   the active path and no second request is made for particles.
3. GFS values remain vector components in SI units: `u` positive eastward and
   `v` positive northward. Invalid/null cells remain invalid and are not
   fabricated or interpolated across.
6. Heat pass uses premultiplied output and destination-color blending:
   `map * (1 - opacity + opacity * windColor)`. At opacity 1 this matches the
   reference multiplication. Our unchanged colored basemap makes the final
   colors different from Yr's neutral basemap.
7. Native double-precision projection uses the matrix supplied for that exact
   render frame, in world units `512 * 2^zoom`. Clip XYZW plus atlas UVs are
   passed to GPU, preserving perspective interpolation, pitch and bearing.
   The RN bridge does not synchronize camera frames.
8. Shared C++ particles bilinearly sample the same GFS vector grid, integrate with
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

The native control samples the published GFS grid on `sampleCoordinate` changes,
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

## Grid transport, cache and lifecycle

- The React Native GFS client owns viewport debounce, persistent cache, and
  offline package reuse. A cached grid remains usable when connectivity is lost.
- The native bridge copies `windU`/`windV` only when the field identity changes;
  the identity includes run, forecast time, bounds, width, and height.
- Native retains the field and performs no fetch, parsing, or array allocation
  per render frame. Invalid cells remain unavailable.
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

The active particle source is the MARIS normalized GFS grid. Legacy MET/PNG
loader code remains unreachable for compatibility during this migration and
must not be used as a fallback.
