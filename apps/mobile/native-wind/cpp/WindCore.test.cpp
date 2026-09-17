#include "WindCore.hpp"
#include <cassert>
#include <iostream>
int main() {
  assert(maris::windParticleGroups(0) == 0);
  const float thresholds[] = {1.1f, 2.2f, 3.3f, 4.4f, 5.5f};
  for (int band = 0; band < 5; ++band) {
    assert(maris::windParticleGroups(std::nextafter(thresholds[band], 0.f)) == band);
    assert(maris::windParticleGroups(thresholds[band]) == band + 1);
    size_t visible = 0;
    for (size_t i = 0; i < 750; ++i)
      visible += int(i % 5) < maris::windParticleGroups(thresholds[band]);
    assert(visible == size_t(band + 1) * 150);
  }
  assert(maris::windParticleGroups(40) == 5);
  std::vector<maris::ClipVertex> mesh;
  maris::buildTrailMesh({{0, 0, 0, 1, 1, 0}, {1, 0, 0, 2, 1, 0}}, 400, 800, mesh);
  assert(mesh.size() == 6);
  assert(std::abs((mesh[1].y - mesh[0].y) * 800 / 2 - maris::trailWidthPixels) < 1e-6);
  assert(std::abs((mesh[5].y / mesh[5].w - mesh[2].y / mesh[2].w) * 800 / 2 - maris::trailWidthPixels) < 1e-6);
  maris::buildTrailMesh({{0, 0, 0, 1, 1, 0}, {0, 0, 0, 1, 1, 0}}, 400, 800, mesh);
  assert(mesh.empty());
  assert(std::abs(maris::my(0) - .5) < 1e-10);
  auto p = maris::plan(-80.2, 25.7, -80.1, 25.8, 14);
  assert(p.z == 6 && p.width() <= 1024 && p.height() <= 1024);
  auto wrap = maris::plan(179, -10, -179, 10, 4);
  assert(wrap.width() < 2048);
  maris::Field field({1, 0, 0, 1, 0});
  std::vector<uint8_t> a(256 * 256 * 4), b(a.size());
  for (size_t i = 0; i < a.size(); i += 4) {
    a[i] = 128;
    a[i + 1] = 132;
    a[i + 3] = 255;
    b[i] = 136;
    b[i + 1] = 132;
    b[i + 3] = 255;
  }
  field.put(0, 0, a.data(), 1024);
  field.put(1, 0, b.data(), 1024);
  float u, v;
  assert(field.sample(.5, .25, u, v));
  assert(std::abs(u - 2) < 1e-6 && std::abs(v - 2) < 1e-6);
  const double sampleLatitude = std::atan(std::sinh(maris::pi * .5)) * 180 / maris::pi;
  assert(std::abs(maris::speedAtCoordinate(&field, 0, sampleLatitude) - std::sqrt(8.)) < 1e-6);
  assert(std::abs(maris::speedAtCoordinate(&field, 360, sampleLatitude) - std::sqrt(8.)) < 1e-6);
  assert(maris::speedAtCoordinate(nullptr, 0, 0) == -1);
  b[3] = 0;
  field.put(1, 0, b.data(), 1024);
  assert(!field.sample(256.5 / 512., .5 / 512., u, v));
  double matrix[16] = {1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1};
  auto q = maris::quad({0, 0, 0, 0, 0}, matrix, 0);
  assert(q[3].x == 512 && q[3].y == 512 && q[3].u == 1 && q[3].v == 1);
  maris::TileCache cache;
  cache.put("revision1/0/0/0", a.data());
  maris::Field global({0, 0, 0, 0, 0});
  assert(cache.copy("revision1/0/0/0", global, 0, 0));
  assert(!cache.copy("revision2/0/0/0", global, 0, 0));
  for (int i = 0; i < 129; i++)
    cache.put(std::to_string(i), a.data());
  assert(!cache.copy("revision1/0/0/0", global, 0, 0));
  for (size_t i = 0; i < a.size(); i += 4) {
    a[i] = 140;
    a[i + 1] = 132;
  }
  global.put(0, 0, a.data(), 1024);
  double screen[16] = {2. / 512, 0, 0, 0, 0,  -2. / 512, 0, 0,
                       0,        0, 1, 0, -1, 1,         0, 1};
  auto bounds = maris::viewport(screen, 0);
  assert(std::abs(bounds[0]) < 1e-10 && std::abs(bounds[3] - 1) < 1e-10);
  maris::Particles particles;
  bool exceedsPreviousTrailCapacity = false;
  const size_t expectedParticles = size_t(.6f * maris::maximumParticleCount);
  for (int frame = 0; frame < 300; frame++) {
    const auto &lines = particles.update(global, screen, 0, 1. / 60, .6, 1);
    assert(lines.size() <= expectedParticles * (maris::Particle::trailCapacity - 1) * 2);
    exceedsPreviousTrailCapacity |= lines.size() > expectedParticles * (64 - 1) * 2;
    for (size_t i = 0; i + 1 < lines.size(); i += 2) {
      assert(std::isfinite(lines[i].x) && std::isfinite(lines[i].y));
      // R positive moves east; G positive moves north (up in this clip matrix).
      assert(lines[i + 1].x >= lines[i].x && lines[i + 1].y >= lines[i].y);
      assert(lines[i].u >= 0 && lines[i].u <= 1);
    }
  }
  assert(exceedsPreviousTrailCapacity);
  for (size_t i = 0; i < a.size(); i += 4) {
    a[i] = 129; a[i + 1] = 128; // 0.5 m/s: no particles, even accelerated.
  }
  global.put(0, 0, a.data(), 1024);
  assert(particles.update(global, screen, 0, .016, 1, 25).empty());
  assert(particles.update(global, screen, 0, .016, 0, 1).empty());
  maris::Field absent({0, 0, 0, 0, 0});
  assert(particles.update(absent, screen, 0, .016, 1, 1).empty());
  std::cout << "WindCore: projection, wrapping, bilinear seam, validity, cache "
               "version/LRU, advection, lifetime/fade and disabled particles "
               "passed\n";
}
