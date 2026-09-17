# Native wind: integration audit

Baseline: `4c90026`. No Skia dependency or wind overlay is present at this baseline.

## Resolved renderer versions

| Platform | React Native binding | Native SDK | Backend | Extension |
|---|---|---|---|---|
| iOS | 11.3.10 | 6.26.0 (Package.resolved) | Metal | `MLNCustomStyleLayer` |
| Android | 11.3.10 | 13.2.0 (binding gradle.properties) | OpenGL ES | `CustomLayer(id, nativeHost)` / C++ `CustomLayerHost` |

The React Native binding does not expose a custom rendering layer component.
Both native hooks are experimental. The Android Java API explicitly warns
against production use. A product implementation must pin these SDK versions,
test native lifecycle behavior on upgrades, and own its bridge and GPU resources.

## Exact extension contract

In iOS 6.26.0, `drawInMapView:withContext:` exposes a Metal render encoder and
the complete projection matrix. It does **not** expose the command buffer or
pre-render compute callback that newer documentation describes. Adding a
compute encoder while the supplied render encoder is active is invalid.
Simulation must therefore be scheduled before the map's render pass with
explicit resource synchronization, or implemented using a fragment-based method
that needs no separate compute pass. A separate unsynchronized command queue is
not an acceptable substitute.

Android 13.2.0 provides `initialize`, `render`, `contextLost`, `deinitialize`.
The Java layer takes ownership of a native `CustomLayerHost` pointer. A bridge
must respect that ownership; a second delete from the React Native module would
be a use-after-free. GLES resources belong to the map's rendering context/thread.
The installed AAR's C++ ABI must match the headers used by the extension.

The drawing matrix uses a world of `512 * 2^zoom` units, not the PNG tile size.
Geographic vertices must be transformed with that matrix; reconstructing a
2D screen rotation from JS camera events loses pitch and synchronization.

## Architecture decision

1. A platform-neutral C++ field module owns tile addressing, unwrapped Mercator
   bounds, atlas layout, forecast revision/time keys, bounded cache bookkeeping,
   generation cancellation, and common wind parameters.
2. Platform transports fetch the MET catalog and PNGs on worker queues using an
   identifiable User-Agent. Catalog, version and timestep are part of cache keys.
   PNG decoding preserves numerical R/G values, without display color transforms.
3. Adjacent raw tiles are composed at native resolution into a single atlas.
   Missing tiles have an explicit validity mask. Neighbor texels on both sides of
   a tile boundary participate in interpolation before vector magnitude is taken.
   The atlas is uploaded only when its content/version changes.
4. iOS encodes into `MLNCustomStyleLayer.renderEncoder`; Android implements
   `mbgl::style::CustomLayerHost`. Both use the projection matrix supplied for the
   current native frame, retaining pitch, bearing and viewport alignment.
5. Native shaders decode `(rg * 255 - 128) / 2`, calculate `length(direction)`,
   and interpolate NRK's ten wind color stops. The heatmap uses destination-color
   blending in the map framebuffer; a separate particle pass uses alpha blending.
6. Particle simulation uses the same interpolated field and native/GPU timing.
   Context loss, style reload, backgrounding, removal and stale async completions
   must be explicitly handled. No JS animation loop or frame-by-frame bridge calls.
7. RN exposes only attach/detach and enabled, opacity, density, animationSpeed.
   The layer is ordered below nautical text/symbols. Styles and navigation
   components remain owned by the existing map implementation.

## Reference and limits of reuse

`nrkno/yr-map-docs` demonstrates a **static heatmap**, using stitched raw tiles,
a vector-decoding fragment shader, a gradient texture and multiplication with a
map texture. Its requestAnimationFrame waits for images to load; it is not a
particle simulation. There is no particle behavior/code in that repository to
copy. Native animation is additional work, not a port of an included simulator.

Primary references:

- https://github.com/nrkno/yr-map-docs/blob/main/src/components/RenderWindExample/shaders/RenderWindDataByWindSpeed.frag.glsl
- https://github.com/nrkno/yr-map-docs/blob/main/src/helpers/colors.ts
- https://github.com/maplibre/maplibre-native/blob/ios-v6.26.0/platform/darwin/src/MLNCustomStyleLayer.h
- https://github.com/maplibre/maplibre-native/blob/ios-v6.26.0/platform/darwin/src/MLNCustomStyleLayer.mm
- https://github.com/maplibre/maplibre-native/blob/ios-v6.26.0/platform/ios/MapLibre.docc/CustomStyleLayerExample.md
- https://github.com/maplibre/maplibre-native/blob/android-v13.2.0/include/mbgl/style/layers/custom_layer.hpp
- https://github.com/maplibre/maplibre-native/blob/android-v13.2.0/platform/android/MapLibreAndroid/src/main/java/org/maplibre/android/style/layers/CustomLayer.java
- https://prod.yr-maps.met.no/concepts

## Validation status

The initial audit has now been followed by a native implementation in
`apps/mobile/native-wind`. See its README for the implemented pipeline and
`native-wind-validation.md` for actual validation results and open limitations.
Particle simulation currently runs in shared native C++, not GPU compute. HTTP
transport, PNG decoding and lifecycle remain platform-specific; decoded LRU,
atlas, field mathematics and particle logic are shared. Full GPU profiling and
controlled map-only baselines are still outstanding.
