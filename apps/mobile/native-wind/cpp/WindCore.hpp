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
#include <vector>

namespace maris {
struct RenderStats {
  using Clock = std::chrono::steady_clock;
  Clock::time_point window = Clock::now(), start;
  int frames = 0;
  double cpuMs = 0, fps = 0, averageCpuMs = 0;
  void begin() { start = Clock::now(); }
  bool end() {
    auto now = Clock::now();
    cpuMs += std::chrono::duration<double, std::milli>(now - start).count();
    frames++;
    double seconds = std::chrono::duration<double>(now - window).count();
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
constexpr double pi = 3.14159265358979323846;
inline double mx(double lon) { return (lon + 180.) / 360.; }
inline double my(double lat) {
  return (1. - std::asinh(std::tan(std::clamp(lat, -85.05112878, 85.05112878) *
                                   pi / 180.)) /
                   pi) /
         2.;
}
struct Plan {
  int z = 0, left = 0, top = 0, right = 0, bottom = 0;
  int width() const { return (right - left + 1) * 256; }
  int height() const { return (bottom - top + 1) * 256; }
  std::string key() const {
    return std::to_string(z) + "/" + std::to_string(left) + "/" +
           std::to_string(top) + "/" + std::to_string(right) + "/" +
           std::to_string(bottom);
  }
};
inline Plan plan(double west, double south, double east, double north,
                 double zoom, int maxDimension = 2048) {
  if (east < west)
    east += 360.;
  for (int z = std::clamp(int(std::floor(zoom)), 0, 6);; --z) {
    const int n = 1 << z;
    Plan p{z, int(std::floor(mx(west) * n)) - 1,
           std::max(0, int(std::floor(my(north) * n)) - 1),
           int(std::floor(mx(east) * n)) + 1,
           std::min(n - 1, int(std::floor(my(south) * n)) + 1)};
    if ((p.width() <= maxDimension && p.height() <= maxDimension) || z == 0)
      return p;
  }
}
struct Field {
  Plan plan;
  std::vector<uint8_t> rgba;
  int received = 0;
  explicit Field(Plan p)
      : plan(p), rgba(size_t(p.width()) * p.height() * 4, 0) {}
  void put(int x, int y, const uint8_t *bytes, size_t stride) {
    for (int row = 0; row < 256; ++row)
      std::copy_n(bytes + row * stride, 256 * 4,
                  rgba.data() +
                      ((y - plan.top) * 256 + row) * size_t(plan.width()) * 4 +
                      (x - plan.left) * 256 * 4);
    received++;
  }
  // Bilinear across the *whole* atlas, including adjacent tile boundaries.
  bool sample(double x, double y, float &u, float &v) const {
    const double n = double(1 << plan.z);
    double px = (x * n - plan.left) * 256 - .5,
           py = (y * n - plan.top) * 256 - .5;
    int ix = int(std::floor(px)), iy = int(std::floor(py));
    if (ix < 0 || iy < 0 || ix + 1 >= plan.width() || iy + 1 >= plan.height())
      return false;
    const double fx = px - ix, fy = py - iy;
    u = v = 0;
    for (int dy = 0; dy < 2; ++dy)
      for (int dx = 0; dx < 2; ++dx) {
        size_t o = (size_t(iy + dy) * plan.width() + ix + dx) * 4;
        if (rgba[o + 3] < 255)
          return false;
        double w = (dx ? fx : 1 - fx) * (dy ? fy : 1 - fy);
        u += float((rgba[o] - 128.) * .5 * w);
        v += float((rgba[o + 1] - 128.) * .5 * w);
      }
    return true;
  }
};
inline bool overlaps(const Plan &a, const Plan &b) {
  const double an = double(1 << a.z), bn = double(1 << b.z);
  return a.left/an < (b.right+1)/bn && (a.right+1)/an > b.left/bn &&
         a.top/an < (b.bottom+1)/bn && (a.bottom+1)/an > b.top/bn;
}
// Shared, bounded decoded-tile cache. URLs include MET revision and valid time.
class TileCache {
  struct Entry {
    std::string url;
    std::vector<uint8_t> rgba;
  };
  std::list<Entry> entries;
  std::mutex mutex;

public:
  bool copy(const std::string &url, Field &field, int x, int y) {
    std::lock_guard<std::mutex> lock(mutex);
    for (auto i = entries.begin(); i != entries.end(); ++i)
      if (i->url == url) {
        field.put(x, y, i->rgba.data(), 1024);
        entries.splice(entries.begin(), entries, i);
        return true;
      }
    return false;
  }
  void put(const std::string &url, const uint8_t *rgba) {
    std::lock_guard<std::mutex> lock(mutex);
    entries.remove_if([&](const Entry &e) { return e.url == url; });
    entries.push_front({url, std::vector<uint8_t>(rgba, rgba + 256 * 256 * 4)});
    while (entries.size() > 32)
      entries.pop_back(); // 8 MiB maximum; independent from HTTP disk cache.
  }
  void clear() { std::lock_guard<std::mutex> lock(mutex); entries.clear(); }
};
struct Vertex {
  float x, y, u, v;
};
// Transform in double precision on CPU to avoid high-zoom float cancellation.
// Vertices then carry projected clip x/y/z/w for the native GPU.
struct ClipVertex {
  float x, y, z, w, u, v;
};
inline constexpr float trailWidthPixels = 5.f;
inline constexpr size_t maximumParticleCount = 1000;
// Expand in screen space: Metal lines are fixed-width and GLES wide-line
// support varies by device. Triangles give both backends the same thickness.
inline void buildTrailMesh(const std::vector<ClipVertex> &lines, double width,
                           double height, std::vector<ClipVertex> &mesh) {
  mesh.clear();
  if (width <= 0 || height <= 0) return;
  if (mesh.capacity() < lines.size() * 3)
    std::vector<ClipVertex>().swap(mesh);
  mesh.reserve(lines.size() * 3);
  for (size_t i = 0; i + 1 < lines.size(); i += 2) {
    auto a = lines[i], b = lines[i + 1];
    if (a.w <= 0 || b.w <= 0) continue;
    double dx = (b.x / b.w - a.x / a.w) * width;
    double dy = (b.y / b.w - a.y / a.w) * height;
    double length = std::hypot(dx, dy);
    if (!std::isfinite(length) || length < 1e-8) continue;
    float ox = float(-dy / length * trailWidthPixels / width);
    float oy = float(dx / length * trailWidthPixels / height);
    auto edge = [&](ClipVertex p, float side) {
      p.x += ox * p.w * side; p.y += oy * p.w * side;
      p.v = side;
      return p;
    };
    auto al = edge(a, -1), ar = edge(a, 1);
    auto bl = edge(b, -1), br = edge(b, 1);
    mesh.insert(mesh.end(), {al, ar, bl, bl, ar, br});
  }
}
inline ClipVertex project(double x, double y, float u, float v, const double *m,
                          double zoom) {
  double world = 512. * std::exp2(zoom);
  x *= world;
  y *= world;
  return {float(m[0] * x + m[4] * y + m[12]),
          float(m[1] * x + m[5] * y + m[13]),
          float(m[2] * x + m[6] * y + m[14]),
          float(m[3] * x + m[7] * y + m[15]),
          u,
          v};
}
inline std::array<ClipVertex, 4> quad(const Plan &p, const double *m,
                                      double zoom) {
  double n = double(1 << p.z);
  return {project(p.left / n, p.top / n, 0, 0, m, zoom),
          project(p.left / n, (p.bottom + 1) / n, 0, 1, m, zoom),
          project((p.right + 1) / n, p.top / n, 1, 0, m, zoom),
          project((p.right + 1) / n, (p.bottom + 1) / n, 1, 1, m, zoom)};
}
struct Particle {
  static constexpr size_t trailCapacity = 75;
  double x = 0, y = 0;
  float age = 100, lifetime = 4;
  std::array<std::array<double, 2>, trailCapacity> trail{};
  size_t head = 0, size = 0;
};
inline std::array<double, 4> viewport(const double *m, double zoom) {
  double west = 1e20, north = 1e20, east = -1e20, south = -1e20,
         world = 512 * std::exp2(zoom);
  for (double nx : {-1., 1.})
    for (double ny : {-1., 1.}) {
      double a = m[0] - nx * m[3], b = m[4] - nx * m[7], c = nx * m[15] - m[12];
      double d = m[1] - ny * m[3], e = m[5] - ny * m[7], f = ny * m[15] - m[13];
      double determinant = a * e - b * d;
      if (std::abs(determinant) < 1e-18)
        continue;
      double x = (c * e - b * f) / determinant / world,
             y = (a * f - c * d) / determinant / world;
      west = std::min(west, x);
      east = std::max(east, x);
      north = std::min(north, y);
      south = std::max(south, y);
    }
  return {west, north, east, south};
}
class Particles {
  std::vector<Particle> particles;
  std::vector<ClipVertex> lines;
  uint32_t random = 0x12345678;
  double rng() {
    random ^= random << 13;
    random ^= random >> 17;
    random ^= random << 5;
    return double(random) / 4294967296.;
  }

public:
  const std::vector<ClipVertex> &update(const Field &f, const double *m,
                                        double zoom, double dt, float density,
                                        float speed) {
    size_t count = size_t(std::clamp(density, 0.f, 1.f) * maximumParticleCount);
    if (particles.capacity() < count) {
      particles.reserve(maximumParticleCount);
    }
    particles.resize(count);
    lines.clear();
    if (lines.capacity() < count * (Particle::trailCapacity - 1) * 2)
      std::vector<ClipVertex>().swap(lines);
    lines.reserve(count * (Particle::trailCapacity - 1) * 2);
    const auto bounds = viewport(m, zoom);
    for (auto &p : particles) {
      float u, v;
      if (p.age > p.lifetime || p.x < bounds[0] || p.x > bounds[2] ||
          p.y < bounds[1] || p.y > bounds[3] || !f.sample(p.x, p.y, u, v)) {
        p.x = bounds[0] + rng() * (bounds[2] - bounds[0]);
        p.y = bounds[1] + rng() * (bounds[3] - bounds[1]);
        p.age = 0;
        p.lifetime = 2 + float(rng() * 3);
        p.size = 0;
        p.head = 0;
        if (!f.sample(p.x, p.y, u, v))
          continue;
      }
      // Visualization speed: 4 map pixels/second per m/s, preserving direction
      // and relative magnitude. Not a physical travel-time simulation.
      double k = dt * speed * 4 / (512. * std::exp2(zoom));
      float midU = u, midV = v;
      if (!f.sample(p.x + u * k * .5, p.y - v * k * .5, midU, midV)) {
        p.age = 100;
        continue;
      }
      p.x += midU * k;
      p.y -= midV * k;
      p.age += float(dt);
      p.trail[p.head] = {p.x, p.y};
      p.head = (p.head + 1) % Particle::trailCapacity;
      p.size = std::min(Particle::trailCapacity, p.size + 1);
      for (size_t i = 1; i < p.size; i++) {
        float alpha = float(i) / p.size *
                      std::clamp((p.lifetime - p.age) * 2, 0.f, 1.f) *
                      std::min(1.f, p.age * 3);
        auto &a = p.trail[(p.head + Particle::trailCapacity - p.size + i - 1) %
                         Particle::trailCapacity];
        auto &b = p.trail[(p.head + Particle::trailCapacity - p.size + i) %
                         Particle::trailCapacity];
        lines.push_back(project(a[0], a[1], alpha, 0, m, zoom));
        lines.push_back(project(b[0], b[1], alpha, 0, m, zoom));
      }
    }
    return lines;
  }
};
} // namespace maris
