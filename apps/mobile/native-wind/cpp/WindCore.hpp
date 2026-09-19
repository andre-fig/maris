#pragma once

#include <algorithm>
#include <array>
#include <chrono>
#include <cmath>
#include <cstdint>
#include <list>
#include <memory>
#include <mutex>
#include <string>
#include <unordered_map>
#include <vector>

namespace maris {

struct RenderStats {
  using Clock = std::chrono::steady_clock;

  Clock::time_point window = Clock::now();
  Clock::time_point start;

  int frames = 0;

  double cpuMs = 0;
  double fps = 0;
  double averageCpuMs = 0;

  void begin() {
    start = Clock::now();
  }

  bool end() {
    const auto now = Clock::now();

    cpuMs += std::chrono::duration<double, std::milli>(
                 now - start
             ).count();

    frames++;

    const double seconds =
        std::chrono::duration<double>(
            now - window
        ).count();

    if (seconds < 5)
      return false;

    fps = frames / seconds;
    averageCpuMs = cpuMs / frames;

    frames = 0;
    cpuMs = 0;
    window = now;

    return true;
  }
};

constexpr double pi =
    3.14159265358979323846;

inline double mx(double lon) {
  return (lon + 180.) / 360.;
}

inline double my(double lat) {
  const double clamped =
      std::clamp(
          lat,
          -85.05112878,
          85.05112878
      );

  return (
      1. -
      std::asinh(
          std::tan(
              clamped * pi / 180.
          )
      ) /
          pi
  ) /
         2.;
}

inline double latitudeFromMy(double y) {
  return std::atan(
             std::sinh(
                 pi * (1. - 2. * y)
             )
         ) *
         180. /
         pi;
}

struct Plan {
  int z = 0;
  int left = 0;
  int top = 0;
  int right = 0;
  int bottom = 0;

  int width() const {
    return (right - left + 1) * 256;
  }

  int height() const {
    return (bottom - top + 1) * 256;
  }

  std::string key() const {
    return std::to_string(z) + "/" +
           std::to_string(left) + "/" +
           std::to_string(top) + "/" +
           std::to_string(right) + "/" +
           std::to_string(bottom);
  }
};

struct GridTile {
  double west = 0;
  double south = 0;
  double east = 0;
  double north = 0;

  int width = 0;
  int height = 0;

  std::vector<float> u;
  std::vector<float> v;
  std::vector<uint8_t> valid;

  int z = 0;
  int x = 0;
  int y = 0;
};
struct FieldTileSnapshot {
  int tileZoom = 0;
  std::vector<std::shared_ptr<const GridTile>> tiles;
  std::unordered_map<uint64_t, size_t> tileLookup;
};

struct LookupMetrics {
  uint64_t samples = 0;
  uint64_t directLookups = 0;
  uint64_t timedLookups = 0;
  uint64_t lookupNanos = 0;
};

inline Plan plan(
    double west,
    double south,
    double east,
    double north,
    double zoom,
    int maxDimension = 2048
) {
  if (east < west)
    east += 360.;

  for (
      int z =
          std::clamp(
              int(std::floor(zoom)),
              0,
              6
          );
      ;
      --z
  ) {
    const int n = 1 << z;

    Plan p{
        z,

        int(
            std::floor(
                mx(west) * n
            )
        ) -
            1,

        std::max(
            0,
            int(
                std::floor(
                    my(north) * n
                )
            ) -
                1
        ),

        int(
            std::floor(
                mx(east) * n
            )
        ) +
            1,

        std::min(
            n - 1,
            int(
                std::floor(
                    my(south) * n
                )
            ) +
                1
        )
    };

    if (
        (
            p.width() <= maxDimension &&
            p.height() <= maxDimension
        ) ||
        z == 0
    ) {
      return p;
    }
  }
}

struct Field {
  bool isGfs = false;

  Plan plan;

  std::vector<uint8_t> rgba;

  double west = 0;
  double south = 0;
  double east = 0;
  double north = 0;

  int gridWidth = 0;
  int gridHeight = 0;

  std::vector<float> gridU;
  std::vector<float> gridV;
  std::vector<uint8_t> gridValid;

  // Legacy arbitrary-grid storage. Indexed XYZ fields use immutable snapshots
  // published atomically through indexedTilesSnapshot.
  std::vector<GridTile> gridTiles;
  std::shared_ptr<const FieldTileSnapshot> indexedTilesSnapshot;

  bool indexedTiles = false;

  mutable LookupMetrics lookupMetrics;

  int received = 0;

  explicit Field(Plan p)
      : plan(p),
        rgba(
            size_t(p.width()) *
                p.height() *
                4,
            0
        ) {}

  Field(
      double gridWest,
      double gridSouth,
      double gridEast,
      double gridNorth,
      int width,
      int height,
      std::vector<float> u,
      std::vector<float> v,
      std::vector<uint8_t> valid
  )
      : isGfs(true),
        west(gridWest),
        south(gridSouth),
        east(gridEast),
        north(gridNorth),
        gridWidth(width),
        gridHeight(height),
        gridU(std::move(u)),
        gridV(std::move(v)),
        gridValid(std::move(valid)),
        received(width * height) {
    gridTiles.push_back(
        GridTile{
            gridWest,
            gridSouth,
            gridEast,
            gridNorth,
            width,
            height,
            std::move(gridU),
            std::move(gridV),
            std::move(gridValid)
        }
    );
  }

  explicit Field(
      std::vector<GridTile> tiles
  ) : isGfs(true) {
    indexedTiles = true;
    received = 0;

    if (tiles.empty())
      return;

    auto snapshot = std::make_shared<FieldTileSnapshot>();
    const auto &first = tiles.front();

    const double span =
        first.east >= first.west
            ? first.east -
                  first.west
            : first.east +
                  360. -
                  first.west;

    snapshot->tileZoom =
        std::clamp(
            int(
                std::llround(
                    std::log2(
                        360. / span
                    )
                )
            ),
            0,
            30
        );

    const int n = 1 << snapshot->tileZoom;

    snapshot->tiles.reserve(tiles.size());
    snapshot->tileLookup.reserve(tiles.size());

    for (auto &tile : tiles) {

      double wrappedWest =
          std::fmod(
              tile.west +
                  180. +
                  360.,
              360.
          );

      if (wrappedWest < 0)
        wrappedWest += 360.;

      tile.z = snapshot->tileZoom;

      tile.x =
          std::clamp(
              int(
                  std::floor(
                      wrappedWest /
                      360. *
                      n
                  )
              ),
              0,
              n - 1
          );

      /*
       * This Mercator conversion is done
       * once when the field is created.
       */
      tile.y =
          std::clamp(
              int(
                  std::floor(
                      my(tile.north) *
                      n
                  )
              ),
              0,
              n - 1
          );

      const size_t index = snapshot->tiles.size();
      snapshot->tiles.push_back(
          std::make_shared<const GridTile>(std::move(tile)));
      snapshot->tileLookup[
          tileKey(
              tile.z,
              tile.x,
              tile.y
          )
      ] = index;

      received +=
          tile.width *
          tile.height;
    }

    std::atomic_store_explicit(
        &indexedTilesSnapshot,
        std::shared_ptr<const FieldTileSnapshot>(std::move(snapshot)),
        std::memory_order_release);
  }

  bool upsertGridTile(GridTile tile) {
    if (!indexedTiles) return false;

    auto current = std::atomic_load_explicit(
        &indexedTilesSnapshot,
        std::memory_order_acquire);
    if (!current || tile.z != current->tileZoom) return false;

    auto next = std::make_shared<FieldTileSnapshot>(*current);
    const uint64_t key = tileKey(tile.z, tile.x, tile.y);
    auto it = next->tileLookup.find(key);
    if (it == next->tileLookup.end()) {
      next->tileLookup.emplace(key, next->tiles.size());
      next->tiles.push_back(
          std::make_shared<const GridTile>(std::move(tile)));
    } else {
      next->tiles[it->second] =
          std::make_shared<const GridTile>(std::move(tile));
    }

    std::atomic_store_explicit(
        &indexedTilesSnapshot,
        std::shared_ptr<const FieldTileSnapshot>(std::move(next)),
        std::memory_order_release);
    return true;
  }

  static uint64_t tileKey(
      int z,
      int x,
      int y
  ) {
    return (
               uint64_t(
                   uint32_t(z)
               )
               << 48
           ) |
           (
               uint64_t(
                   uint32_t(x)
               )
               << 24
           ) |
           uint64_t(
               uint32_t(y)
           );
  }

  LookupMetrics
  consumeLookupMetrics() const {
    LookupMetrics result =
        lookupMetrics;

    lookupMetrics = {};

    return result;
  }

  bool complete() const {
    return received ==
           (
               plan.right -
               plan.left +
               1
           ) *
               (
                   plan.bottom -
                   plan.top +
                   1
               );
  }

  void put(
      int x,
      int y,
      const uint8_t *bytes,
      size_t stride
  ) {
    for (
        int row = 0;
        row < 256;
        ++row
    ) {
      std::copy_n(
          bytes +
              row * stride,

          256 * 4,

          rgba.data() +
              (
                  (
                      y -
                      plan.top
                  ) *
                      256 +
                  row
              ) *
                  size_t(
                      plan.width()
                  ) *
                  4 +
              (
                  x -
                  plan.left
              ) *
                  256 *
                  4
      );
    }

    received++;
  }

  bool sample(
      double x,
      double y,
      float &u,
      float &v
  ) const {
    if (isGfs) {
      const uint64_t sampleNumber =
          lookupMetrics.samples++;

      /*
       * Keep metrics sparse.
       * Only 1/64 samples pays chrono cost.
       */
      const bool measureLookup =
          (sampleNumber & 63u) == 0;

      const auto lookupStarted =
          measureLookup
              ? std::chrono::steady_clock::now()
              : std::chrono::steady_clock::
                    time_point{};

      auto finishLookup =
          [&](bool result) {
            if (measureLookup) {
              lookupMetrics
                  .timedLookups++;

              lookupMetrics
                  .lookupNanos +=
                  uint64_t(
                      std::chrono::
                          duration_cast<
                              std::chrono::
                                  nanoseconds>(
                              std::chrono::
                                  steady_clock::
                                      now() -
                              lookupStarted
                          )
                              .count()
                  );
            }

            return result;
          };

      double longitude =
          x * 360. - 180.;

      if (
          !std::isfinite(longitude) ||
          !std::isfinite(y)
      ) {
        return finishLookup(false);
      }

      if (
          longitude < -180. ||
          longitude > 180.
      ) {
        longitude =
            std::fmod(
                longitude + 180.,
                360.
            );

        if (longitude < 0.)
          longitude += 360.;

        longitude -= 180.;
      }

      /*
       * Legacy / arbitrary single-grid path.
       *
       * Latitude is still required here because
       * this grid uses linear latitude internally.
       */
      if (!indexedTiles) {
        if (gridTiles.empty())
          return finishLookup(false);

        const double latitude =
            latitudeFromMy(y);

        if (!std::isfinite(latitude))
          return finishLookup(false);

        const GridTile &tile =
            gridTiles.front();

        const double eastForSample =
            tile.east < tile.west
                ? tile.east + 360.
                : tile.east;

        double sampleLongitude =
            longitude;

        if (
            tile.east < tile.west &&
            sampleLongitude < tile.west
        ) {
          sampleLongitude += 360.;
        }

        if (
            sampleLongitude < tile.west ||
            sampleLongitude >
                eastForSample ||
            latitude < tile.south ||
            latitude > tile.north
        ) {
          return finishLookup(false);
        }

        const double gx =
            tile.width == 1
                ? 0.
                : (
                      sampleLongitude -
                      tile.west
                  ) /
                      (
                          eastForSample -
                          tile.west
                      ) *
                      (
                          tile.width -
                          1
                      );

        const double gy =
            tile.height == 1
                ? 0.
                : (
                      tile.north -
                      latitude
                  ) /
                      (
                          tile.north -
                          tile.south
                      ) *
                      (
                          tile.height -
                          1
                      );

        const int x0 =
            std::clamp(
                int(std::floor(gx)),
                0,
                tile.width - 1
            );

        const int y0 =
            std::clamp(
                int(std::floor(gy)),
                0,
                tile.height - 1
            );

        const int x1 =
            std::min(
                tile.width - 1,
                x0 + 1
            );

        const int y1 =
            std::min(
                tile.height - 1,
                y0 + 1
            );

        const float tx =
            float(gx - x0);

        const float ty =
            float(gy - y0);

        auto valid =
            [&](int ix, int iy) {
              return tile.valid[
                         size_t(iy) *
                             tile.width +
                         ix
                     ] != 0;
            };

        if (
            !valid(x0, y0) ||
            !valid(x1, y0) ||
            !valid(x0, y1) ||
            !valid(x1, y1)
        ) {
          return finishLookup(false);
        }

        const size_t row0 =
            size_t(y0) *
            tile.width;

        const size_t row1 =
            size_t(y1) *
            tile.width;

        auto interpolate =
            [&](const std::vector<float>
                    &values) {
              const float q11 =
                  values[
                      row0 + x0
                  ];

              const float q21 =
                  values[
                      row0 + x1
                  ];

              const float q12 =
                  values[
                      row1 + x0
                  ];

              const float q22 =
                  values[
                      row1 + x1
                  ];

              const float top =
                  q11 +
                  (q21 - q11) *
                      tx;

              const float bottom =
                  q12 +
                  (q22 - q12) *
                      tx;

              return top +
                     (bottom - top) *
                         ty;
            };

        u =
            interpolate(tile.u);

        v =
            interpolate(tile.v);

        return finishLookup(
            std::isfinite(u) &&
            std::isfinite(v)
        );
      }

      /*
       * Indexed XYZ path.
       *
       * IMPORTANT PERFORMANCE OPTIMIZATION:
       *
       * y is already normalized Web Mercator.
       *
       * Old code did:
       *
       *   latitude = latitudeFromMy(y)
       *   tileY = my(latitude)
       *
       * which converted Mercator → latitude →
       * Mercator again for every sample.
       *
       * Tile Y can be derived directly from y.
       */
      auto tileSnapshot = std::atomic_load_explicit(
          &indexedTilesSnapshot,
          std::memory_order_acquire);
      if (!tileSnapshot || tileSnapshot->tiles.empty())
        return finishLookup(false);

      const int tileZoom = tileSnapshot->tileZoom;
      const int n =
          1 << tileZoom;

      int tileX =
          int(
              std::floor(
                  (
                      longitude +
                      180.
                  ) /
                  360. *
                  n
              )
          );

      /*
       * Longitude +180 can produce exactly n.
       * Wrap the dateline back to tile zero.
       */
      if (tileX >= n)
        tileX = 0;

      if (tileX < 0)
        tileX =
            (tileX % n + n) % n;

      const int tileY =
          std::clamp(
              int(
                  std::floor(
                      y * n
                  )
              ),
              0,
              n - 1
          );

      const auto tileIt =
          tileSnapshot->tileLookup.find(
              tileKey(
                  tileZoom,
                  tileX,
                  tileY
              )
          );

      if (
          tileIt ==
          tileSnapshot->tileLookup.end()
      ) {
        return finishLookup(false);
      }

      lookupMetrics
          .directLookups++;

      const GridTile &tile =
          *tileSnapshot->tiles[
              tileIt->second
          ];

      /*
       * Only now convert Mercator Y → latitude.
       *
       * This is still needed because the values
       * inside the current GFS tile are stored
       * on a grid interpolated linearly in
       * latitude.
       *
       * We eliminated the second my(latitude)
       * conversion used only for tile lookup.
       */
      const double latitude =
          latitudeFromMy(y);

      if (!std::isfinite(latitude))
        return finishLookup(false);

      if (
          tile.width <= 0 ||
          tile.height <= 0 ||
          tile.north <= tile.south
      ) {
        return finishLookup(false);
      }

      const bool crossesDateline =
          tile.east < tile.west;

      double sampleLongitude =
          longitude;

      if (
          crossesDateline &&
          sampleLongitude <
              tile.west
      ) {
        sampleLongitude += 360.;
      }

      const double eastForSample =
          crossesDateline
              ? tile.east + 360.
              : tile.east;

      const bool eastEdge =
          eastForSample >= 180. &&
          sampleLongitude <=
              eastForSample;

      if (
          sampleLongitude <
              tile.west ||
          (
              !eastEdge &&
              sampleLongitude >=
                  eastForSample
          ) ||
          latitude <
              tile.south ||
          latitude >
              tile.north
      ) {
        return finishLookup(false);
      }

      const double gx =
          tile.width == 1
              ? 0.
              : (
                    sampleLongitude -
                    tile.west
                ) /
                    (
                        eastForSample -
                        tile.west
                    ) *
                    (
                        tile.width -
                        1
                    );

      const double gy =
          tile.height == 1
              ? 0.
              : (
                    tile.north -
                    latitude
                ) /
                    (
                        tile.north -
                        tile.south
                    ) *
                    (
                        tile.height -
                        1
                    );

      const int x0 =
          std::clamp(
              int(std::floor(gx)),
              0,
              tile.width - 1
          );

      const int y0 =
          std::clamp(
              int(std::floor(gy)),
              0,
              tile.height - 1
          );

      const int x1 =
          std::min(
              tile.width - 1,
              x0 + 1
          );

      const int y1 =
          std::min(
              tile.height - 1,
              y0 + 1
          );

      const float tx =
          float(gx - x0);

      const float ty =
          float(gy - y0);

      const size_t row0 =
          size_t(y0) *
          tile.width;

      const size_t row1 =
          size_t(y1) *
          tile.width;

      const size_t i00 =
          row0 + x0;

      const size_t i10 =
          row0 + x1;

      const size_t i01 =
          row1 + x0;

      const size_t i11 =
          row1 + x1;

      if (
          tile.valid[i00] == 0 ||
          tile.valid[i10] == 0 ||
          tile.valid[i01] == 0 ||
          tile.valid[i11] == 0
      ) {
        return finishLookup(false);
      }

      auto interpolate =
          [&](const std::vector<float>
                  &values) {
            const float q11 =
                values[i00];

            const float q21 =
                values[i10];

            const float q12 =
                values[i01];

            const float q22 =
                values[i11];

            /*
             * Two linear interpolations are
             * slightly cheaper than four
             * independent weighted products.
             */
            const float top =
                q11 +
                (q21 - q11) *
                    tx;

            const float bottom =
                q12 +
                (q22 - q12) *
                    tx;

            return top +
                   (bottom - top) *
                       ty;
          };

      u =
          interpolate(tile.u);

      v =
          interpolate(tile.v);

      return finishLookup(
          std::isfinite(u) &&
          std::isfinite(v)
      );
    }

    /*
     * Legacy MET PNG atlas path.
     */
    const double n =
        double(
            1 << plan.z
        );

    const double px =
        (
            x * n -
            plan.left
        ) *
            256 -
        .5;

    const double py =
        (
            y * n -
            plan.top
        ) *
            256 -
        .5;

    const int ix =
        int(std::floor(px));

    const int iy =
        int(std::floor(py));

    if (
        ix < 0 ||
        iy < 0 ||
        ix + 1 >=
            plan.width() ||
        iy + 1 >=
            plan.height()
    ) {
      return false;
    }

    const double fx =
        px - ix;

    const double fy =
        py - iy;

    u = 0;
    v = 0;

    for (
        int dy = 0;
        dy < 2;
        ++dy
    ) {
      for (
          int dx = 0;
          dx < 2;
          ++dx
      ) {
        const size_t o =
            (
                size_t(iy + dy) *
                    plan.width() +
                ix +
                dx
            ) *
            4;

        if (rgba[o + 3] < 255)
          return false;

        const double weight =
            (
                dx
                    ? fx
                    : 1 - fx
            ) *
            (
                dy
                    ? fy
                    : 1 - fy
            );

        u +=
            float(
                (
                    rgba[o] -
                    128.
                ) *
                .5 *
                weight
            );

        v +=
            float(
                (
                    rgba[o + 1] -
                    128.
                ) *
                .5 *
                weight
            );
      }
    }

    return true;
  }
};

inline double speedAtCoordinate(
    const Field *field,
    double longitude,
    double latitude
) {
  if (!field)
    return -1;

  double x =
      mx(longitude);

  /*
   * Legacy field has a Plan/world-copy.
   * GFS indexed fields normally use normalized
   * longitude directly.
   */
  if (!field->isGfs) {
    const double center =
        (
            field->plan.left +
            field->plan.right +
            1.
        ) /
        (
            2. *
            (
                1 <<
                field->plan.z
            )
        );

    x +=
        std::round(
            center - x
        );
  }

  float u;
  float v;

  return field->sample(
             x,
             my(latitude),
             u,
             v
         )
             ? std::sqrt(
                   double(u) *
                       u +
                   double(v) *
                       v
               )
             : -1;
}

inline bool overlaps(
    const Plan &a,
    const Plan &b
) {
  const double an =
      double(
          1 << a.z
      );

  const double bn =
      double(
          1 << b.z
      );

  return
      a.left / an <
          (
              b.right +
              1
          ) /
              bn &&
      (
          a.right +
          1
      ) /
              an >
          b.left / bn &&
      a.top / an <
          (
              b.bottom +
              1
          ) /
              bn &&
      (
          a.bottom +
          1
      ) /
              an >
          b.top / bn;
}

inline bool canPublish(
    const Field *current,
    const Field &next
) {
  return
      next.received > 0 &&
      (
          !current ||
          next.complete()
      );
}

inline std::array<float, 4>
previousUv(
    const Plan &next,
    const Plan &old
) {
  const double ratio =
      std::exp2(
          old.z -
          next.z
      );

  return {
      float(
          next.width() *
          ratio /
          old.width()
      ),

      float(
          next.height() *
          ratio /
          old.height()
      ),

      float(
          (
              next.left *
                  ratio -
              old.left
          ) *
          256 /
          old.width()
      ),

      float(
          (
              next.top *
                  ratio -
              old.top
          ) *
          256 /
          old.height()
      )
  };
}

inline bool sampleTransition(
    const Field &next,
    const Field *old,
    float progress,
    double x,
    double y,
    float &u,
    float &v
) {
  const bool valid =
      next.sample(
          x,
          y,
          u,
          v
      );

  float oldU;
  float oldV;

  if (
      old &&
      progress < 1 &&
      old->sample(
          x,
          y,
          oldU,
          oldV
      )
  ) {
    if (valid) {
      u =
          oldU +
          (
              u -
              oldU
          ) *
              progress;

      v =
          oldV +
          (
              v -
              oldV
          ) *
              progress;
    } else {
      u = oldU;
      v = oldV;
    }

    return true;
  }

  return valid;
}

/*
 * Legacy MET decoded tile cache.
 *
 * It remains here for compatibility,
 * even though GFS is now the active source.
 */
class TileCache {
  struct Entry {
    std::string url;
    std::vector<uint8_t> rgba;
  };

  std::list<Entry> entries;
  std::mutex mutex;

public:
  bool copy(
      const std::string &url,
      Field &field,
      int x,
      int y
  ) {
    std::lock_guard<std::mutex>
        lock(mutex);

    for (
        auto i = entries.begin();
        i != entries.end();
        ++i
    ) {
      if (i->url == url) {
        field.put(
            x,
            y,
            i->rgba.data(),
            1024
        );

        entries.splice(
            entries.begin(),
            entries,
            i
        );

        return true;
      }
    }

    return false;
  }

  void put(
      const std::string &url,
      const uint8_t *rgba
  ) {
    std::lock_guard<std::mutex>
        lock(mutex);

    entries.remove_if(
        [&](const Entry &e) {
          return e.url == url;
        }
    );

    entries.push_front({
        url,
        std::vector<uint8_t>(
            rgba,
            rgba +
                256 *
                    256 *
                    4
        )
    });

    while (entries.size() > 32)
      entries.pop_back();
  }

  void clear() {
    std::lock_guard<std::mutex>
        lock(mutex);

    entries.clear();
  }
};

struct Vertex {
  float x;
  float y;
  float u;
  float v;
};

struct ClipVertex {
  float x;
  float y;
  float z;
  float w;
  float u;
  float v;
};

inline constexpr float
    trailWidthPixels = 5.f;

inline constexpr size_t
    maximumParticleCount = 1000;

/*
 * Projection helper using an already calculated
 * world scale.
 *
 * Previously every call recalculated:
 *
 *   512 * exp2(zoom)
 *
 * During a large trail rebuild this could happen
 * tens of thousands of times.
 */
inline ClipVertex projectWithWorld(
    double x,
    double y,
    float u,
    float v,
    const double *m,
    double world
) {
  x *= world;
  y *= world;

  return {
      float(
          m[0] * x +
          m[4] * y +
          m[12]
      ),

      float(
          m[1] * x +
          m[5] * y +
          m[13]
      ),

      float(
          m[2] * x +
          m[6] * y +
          m[14]
      ),

      float(
          m[3] * x +
          m[7] * y +
          m[15]
      ),

      u,
      v
  };
}

/*
 * Compatibility wrapper for callers that don't
 * already have the world scale.
 */
inline ClipVertex project(
    double x,
    double y,
    float u,
    float v,
    const double *m,
    double zoom
) {
  const double world =
      512. *
      std::exp2(zoom);

  return projectWithWorld(
      x,
      y,
      u,
      v,
      m,
      world
  );
}

inline std::array<ClipVertex, 4>
quad(
    const Plan &p,
    const double *m,
    double zoom
) {
  const double n =
      double(
          1 << p.z
      );

  /*
   * Compute once for all four vertices.
   */
  const double world =
      512. *
      std::exp2(zoom);

  return {
      projectWithWorld(
          p.left / n,
          p.top / n,
          0,
          0,
          m,
          world
      ),

      projectWithWorld(
          p.left / n,
          (
              p.bottom +
              1
          ) /
              n,
          0,
          1,
          m,
          world
      ),

      projectWithWorld(
          (
              p.right +
              1
          ) /
              n,
          p.top / n,
          1,
          0,
          m,
          world
      ),

      projectWithWorld(
          (
              p.right +
              1
          ) /
              n,
          (
              p.bottom +
              1
          ) /
              n,
          1,
          1,
          m,
          world
      )
  };
}

/*
 * Expand lines into triangles.
 *
 * Same geometry/visual result as before,
 * but avoids std::hypot and initializer-list
 * insertion in the inner loop.
 */
inline void buildTrailMesh(
    const std::vector<ClipVertex> &lines,
    double width,
    double height,
    std::vector<ClipVertex> &mesh
) {
  mesh.clear();

  if (
      width <= 0 ||
      height <= 0
  ) {
    return;
  }

  const size_t required =
      lines.size() * 3;

  if (
      mesh.capacity() <
      required
  ) {
    mesh.reserve(required);
  }

  for (
      size_t i = 0;
      i + 1 < lines.size();
      i += 2
  ) {
    const ClipVertex &a =
        lines[i];

    const ClipVertex &b =
        lines[i + 1];

    if (
        a.w <= 0 ||
        b.w <= 0
    ) {
      continue;
    }

    const double ax =
        a.x / a.w;

    const double ay =
        a.y / a.w;

    const double bx =
        b.x / b.w;

    const double by =
        b.y / b.w;

    const double dx =
        (bx - ax) * width;

    const double dy =
        (by - ay) * height;

    const double lengthSquared =
        dx * dx +
        dy * dy;

    if (
        !std::isfinite(
            lengthSquared
        ) ||
        lengthSquared < 1e-16
    ) {
      continue;
    }

    /*
     * sqrt is sufficient here.
     *
     * std::hypot has extra overflow/underflow
     * robustness that isn't needed for these
     * screen-space values.
     */
    const double invLength =
        1. /
        std::sqrt(
            lengthSquared
        );

    const float ox =
        float(
            -dy *
            invLength *
            trailWidthPixels /
            width
        );

    const float oy =
        float(
            dx *
            invLength *
            trailWidthPixels /
            height
        );

    ClipVertex al = a;
    ClipVertex ar = a;
    ClipVertex bl = b;
    ClipVertex br = b;

    al.x -= ox * al.w;
    al.y -= oy * al.w;
    al.v = -1;

    ar.x += ox * ar.w;
    ar.y += oy * ar.w;
    ar.v = 1;

    bl.x -= ox * bl.w;
    bl.y -= oy * bl.w;
    bl.v = -1;

    br.x += ox * br.w;
    br.y += oy * br.w;
    br.v = 1;

    /*
     * Triangle 1:
     * al, ar, bl
     *
     * Triangle 2:
     * bl, ar, br
     */
    mesh.push_back(al);
    mesh.push_back(ar);
    mesh.push_back(bl);

    mesh.push_back(bl);
    mesh.push_back(ar);
    mesh.push_back(br);
  }
}

struct Particle {
  static constexpr size_t
      trailCapacity = 40;

  static constexpr double
      trailSampleInterval =
          1. / 30.;

  double x = 0;
  double y = 0;

  float age = 100;
  float lifetime = 4;

  std::array<
      std::array<double, 2>,
      trailCapacity
  > trail{};

  size_t head = 0;
  size_t size = 0;

  double trailAccumulator = 0;
};

/*
 * Keep exactly the existing behavior.
 */
inline int windParticleGroups(
    float metersPerSecond
) {
  if (metersPerSecond < 1.1f)
    return 0;

  if (metersPerSecond < 2.2f)
    return 1;

  if (metersPerSecond < 3.3f)
    return 2;

  if (metersPerSecond < 4.4f)
    return 3;

  if (metersPerSecond < 5.5f)
    return 4;

  return 5;
}

/*
 * Variant receiving precomputed world scale.
 */
inline std::array<double, 4>
viewportWithWorld(
    const double *m,
    double world
) {
  double west = 1e20;
  double north = 1e20;
  double east = -1e20;
  double south = -1e20;

  for (double nx : {-1., 1.}) {
    for (double ny : {-1., 1.}) {
      const double a =
          m[0] -
          nx * m[3];

      const double b =
          m[4] -
          nx * m[7];

      const double c =
          nx * m[15] -
          m[12];

      const double d =
          m[1] -
          ny * m[3];

      const double e =
          m[5] -
          ny * m[7];

      const double f =
          ny * m[15] -
          m[13];

      const double determinant =
          a * e -
          b * d;

      if (
          std::abs(
              determinant
          ) <
          1e-18
      ) {
        continue;
      }

      const double x =
          (
              c * e -
              b * f
          ) /
          determinant /
          world;

      const double y =
          (
              a * f -
              c * d
          ) /
          determinant /
          world;

      west =
          std::min(
              west,
              x
          );

      east =
          std::max(
              east,
              x
          );

      north =
          std::min(
              north,
              y
          );

      south =
          std::max(
              south,
              y
          );
    }
  }

  return {
      west,
      north,
      east,
      south
  };
}

inline std::array<double, 4>
viewport(
    const double *m,
    double zoom
) {
  const double world =
      512. *
      std::exp2(zoom);

  return viewportWithWorld(
      m,
      world
  );
}

class Particles {
  std::vector<Particle>
      particles;

  std::vector<ClipVertex>
      lines;

  uint32_t random =
      0x12345678;

  bool meshDirty = true;

  bool hasProjection = false;

  double lastProjection[16] = {};

  double lastZoom = 0;

  double rng() {
    random ^= random << 13;
    random ^= random >> 17;
    random ^= random << 5;

    return double(random) /
           4294967296.;
  }

public:
  void invalidateTrails() {
    bool changed = false;

    for (
        auto &particle :
        particles
    ) {
      if (
          particle.size != 0 ||
          particle.head != 0
      ) {
        changed = true;
      }

      particle.head = 0;
      particle.size = 0;
      particle.trailAccumulator = 0;
    }

    if (changed)
      meshDirty = true;
  }

  bool needsMeshRebuild() const {
    return meshDirty;
  }

  void markMeshUploaded() {
    meshDirty = false;
  }

  const std::vector<ClipVertex> &
  update(
      const Field &f,
      const double *m,
      double zoom,
      double dt,
      float density,
      float speed,
      const Field *old = nullptr,
      float progress = 1
  ) {
    /*
     * IMPORTANT:
     *
     * Preserve the existing density rule exactly.
     *
     * zoom 0  -> 100%
     * zoom 8  -> 50%
     * zoom 16 -> 0%
     */
    const float zoomFactor =
        std::clamp(
            1.f -
                float(
                    std::clamp(
                        zoom,
                        0.,
                        16.
                    ) /
                    16.
                ),
            0.f,
            1.f
        );

    const size_t count =
        size_t(
            std::clamp(
                density,
                0.f,
                1.f
            ) *
            zoomFactor *
            maximumParticleCount
        );

    if (
        count !=
        particles.size()
    ) {
      meshDirty = true;
    }

    if (
        particles.capacity() <
        count
    ) {
      particles.reserve(
          maximumParticleCount
      );
    }

    particles.resize(count);

    const size_t maximumLineCount =
        count *
        (
            Particle::
                trailCapacity -
            1
        ) *
        2;

    if (
        lines.capacity() <
        maximumLineCount
    ) {
      lines.reserve(
          maximumLineCount
      );
    }

    /*
     * Projection comparison remains unchanged.
     */
    bool projectionChanged =
        !hasProjection ||
        lastZoom != zoom;

    for (
        int i = 0;
        i < 16 &&
        !projectionChanged;
        ++i
    ) {
      projectionChanged =
          lastProjection[i] !=
          m[i];
    }

    if (projectionChanged) {
      std::copy(
          m,
          m + 16,
          lastProjection
      );

      lastZoom = zoom;
      hasProjection = true;

      meshDirty = true;
    }

    /*
     * Biggest safe hot-path optimization:
     *
     * Calculate this once per update.
     *
     * Previously the same exp2 was calculated
     * once per particle for k and once per
     * projected trail point.
     */
    const double world =
        512. *
        std::exp2(zoom);

    const auto bounds =
        viewportWithWorld(
            m,
            world
        );

    /*
     * Same value for every particle this frame.
     */
    const double movementScale =
        dt *
        speed *
        4 /
        world;

    auto clearTrail =
        [&](Particle &particle) {
          const bool changed =
              particle.size != 0 ||
              particle.head != 0;

          particle.size = 0;
          particle.head = 0;
          particle.trailAccumulator = 0;

          if (changed)
            meshDirty = true;
        };

    for (
        size_t index = 0;
        index < particles.size();
        ++index
    ) {
      auto &p =
          particles[index];

      float u;
      float v;

      if (
          p.age >
              p.lifetime ||
          p.x <
              bounds[0] ||
          p.x >
              bounds[2] ||
          p.y <
              bounds[1] ||
          p.y >
              bounds[3] ||
          !sampleTransition(
              f,
              old,
              progress,
              p.x,
              p.y,
              u,
              v
          )
      ) {
        p.x =
            bounds[0] +
            rng() *
                (
                    bounds[2] -
                    bounds[0]
                );

        p.y =
            bounds[1] +
            rng() *
                (
                    bounds[3] -
                    bounds[1]
                );

        p.age = 0;

        p.lifetime =
            2 +
            float(
                rng() * 3
            );

        clearTrail(p);

        if (
            !sampleTransition(
                f,
                old,
                progress,
                p.x,
                p.y,
                u,
                v
            )
        ) {
          continue;
        }
      }

      /*
       * Previously:
       *
       * dt * speed * 4 /
       * (512 * exp2(zoom))
       *
       * for every particle.
       *
       * Now precomputed once as movementScale.
       */
      const double k =
          movementScale;

      float midU = u;
      float midV = v;

      if (
          !sampleTransition(
              f,
              old,
              progress,
              p.x +
                  u *
                      k *
                      .5,
              p.y -
                  v *
                      k *
                      .5,
              midU,
              midV
          )
      ) {
        p.age = 100;

        clearTrail(p);

        continue;
      }

      p.x +=
          midU * k;

      p.y -=
          midV * k;

      p.age +=
          float(dt);

      /*
       * Preserve existing wind-speed density
       * behavior exactly.
       *
       * sqrt is enough here and avoids some
       * std::hypot overhead.
       */
      const float windSpeed =
          std::sqrt(
              midU * midU +
              midV * midV
          );

      if (
          int(index % 5) >=
          windParticleGroups(
              windSpeed
          )
      ) {
        clearTrail(p);
        continue;
      }

      p.trailAccumulator +=
          dt;

      if (
          p.trailAccumulator >=
          Particle::
              trailSampleInterval
      ) {
        p.trailAccumulator =
            std::fmod(
                p.trailAccumulator,
                Particle::
                    trailSampleInterval
            );

        p.trail[
            p.head
        ] = {
            p.x,
            p.y
        };

        p.head =
            (
                p.head +
                1
            ) %
            Particle::
                trailCapacity;

        p.size =
            std::min(
                Particle::
                    trailCapacity,
                p.size + 1
            );

        meshDirty = true;
      }
    }

    if (meshDirty) {
      lines.clear();

      /*
       * world is reused for every projection.
       *
       * No exp2() inside project loop.
       */
      for (
          const auto &p :
          particles
      ) {
        if (p.size < 2)
          continue;

        const float ageFade =
            std::clamp(
                (
                    p.lifetime -
                    p.age
                ) *
                    2,
                0.f,
                1.f
            ) *
            std::min(
                1.f,
                p.age * 3
            );

        for (
            size_t i = 1;
            i < p.size;
            ++i
        ) {
          const float alpha =
              float(i) /
              float(p.size) *
              ageFade;

          const size_t aIndex =
              (
                  p.head +
                  Particle::
                      trailCapacity -
                  p.size +
                  i -
                  1
              ) %
              Particle::
                  trailCapacity;

          const size_t bIndex =
              (
                  p.head +
                  Particle::
                      trailCapacity -
                  p.size +
                  i
              ) %
              Particle::
                  trailCapacity;

          const auto &a =
              p.trail[
                  aIndex
              ];

          const auto &b =
              p.trail[
                  bIndex
              ];

          lines.push_back(
              projectWithWorld(
                  a[0],
                  a[1],
                  alpha,
                  0,
                  m,
                  world
              )
          );

          lines.push_back(
              projectWithWorld(
                  b[0],
                  b[1],
                  alpha,
                  0,
                  m,
                  world
              )
          );
        }
      }
    }

    return lines;
  }
};

} // namespace maris
