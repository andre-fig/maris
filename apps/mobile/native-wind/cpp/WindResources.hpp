#pragma once
#include "WindCore.hpp"
#include <cstdio>
#include <fstream>

namespace maris {
// A bounded two-second FPS window, with slow recovery to prevent oscillation.
class Quality {
  double elapsed = 0;
  unsigned frames = 0, healthy = 0;
public:
  bool constrained;
  float density;
  explicit Quality(bool low = false) : constrained(low), density(low ? .5f : 1.f) {}
  void frame(double dt) {
    if (dt <= 0 || dt > 1) return;
    elapsed += dt;
    ++frames;
    if (elapsed < 2) return;
    double fps = frames / elapsed;
    if (fps < 35) { density = std::max(.2f, density * .75f); healthy = 0; }
    else if (fps > 55 && ++healthy >= 5) {
      density = std::min(constrained ? .5f : 1.f, density + .1f);
      healthy = 0;
    } else if (fps <= 55) healthy = 0;
    elapsed = 0; frames = 0;
  }
  int maxDimension() const { return constrained || density < .7f ? 1024 : 2048; }
  int zoomPenalty() const { return constrained || density < .7f ? 1 : 0; }
};

struct Snapshot {
  std::shared_ptr<Field> field;
  std::string catalog;
  int64_t savedAt = 0;
};
// A small persistent ring of complete fields, stored outside disposable HTTP caches.
// Validated dimensions/lengths bound disk and RAM even with a corrupt file.
class SnapshotStore {
  std::string path;
  static constexpr int slots = 4;
  static uint64_t checksum(const Field &field, const std::string &catalog) {
    uint64_t hash = 14695981039346656037ULL;
    for (auto c : catalog) { hash ^= uint8_t(c); hash *= 1099511628211ULL; }
    for (auto c : field.rgba) { hash ^= c; hash *= 1099511628211ULL; }
    return hash;
  }
public:
  explicit SnapshotStore(std::string p) : path(std::move(p)) {}
  std::string loadCatalog() const {
    for (int slot = 0; slot <= slots; ++slot) {
      std::ifstream in(slot == slots ? path : path + "." + std::to_string(slot), std::ios::binary);
      uint32_t magic = 0, length = 0;
      int64_t savedAt = 0;
      int32_t p[5]{};
      in.read(reinterpret_cast<char *>(&magic), sizeof(magic));
      in.read(reinterpret_cast<char *>(&savedAt), sizeof(savedAt));
      in.read(reinterpret_cast<char *>(p), sizeof(p));
      in.read(reinterpret_cast<char *>(&length), sizeof(length));
      if (!in || magic != 0x574E4432 || length > 64 * 1024) continue;
      std::string catalog(length, '\0');
      in.read(catalog.data(), length);
      if (in) return catalog;
    }
    return {};
  }
  bool save(const Field &field, const std::string &catalog, int64_t now) const {
    const auto &p = field.plan;
    if (field.received != (p.right-p.left+1)*(p.bottom-p.top+1) ||
        field.rgba.size() > 16*1024*1024 || catalog.size() > 64*1024) return false;
    for (int slot = slots - 1; slot > 0; --slot) {
      std::remove((path + "." + std::to_string(slot)).c_str());
      std::rename((path + "." + std::to_string(slot - 1)).c_str(),
                  (path + "." + std::to_string(slot)).c_str());
    }
    std::ofstream out(path + ".tmp", std::ios::binary | std::ios::trunc);
    const uint32_t magic = 0x574E4432, length = uint32_t(catalog.size());
    const uint64_t hash = checksum(field, catalog);
    const int32_t coords[] = {p.z, p.left, p.top, p.right, p.bottom};
    out.write(reinterpret_cast<const char *>(&magic), sizeof(magic));
    out.write(reinterpret_cast<const char *>(&now), sizeof(now));
    out.write(reinterpret_cast<const char *>(coords), sizeof(coords));
    out.write(reinterpret_cast<const char *>(&length), sizeof(length));
    out.write(catalog.data(), length);
    out.write(reinterpret_cast<const char *>(field.rgba.data()), field.rgba.size());
    out.write(reinterpret_cast<const char *>(&hash), sizeof(hash));
    out.close();
    if (!out) { std::remove((path + ".tmp").c_str()); return false; }
    if (std::rename((path + ".tmp").c_str(), (path + ".0").c_str()) != 0) return false;
    std::remove(path.c_str()); // remove the pre-ring legacy snapshot after migration
    return true;
  }
  Snapshot load(const Plan &expected) const {
    std::ifstream in;
    uint32_t magic = 0, length = 0;
    int64_t savedAt = 0;
    int32_t p[5]{};
    for (int slot = 0; slot <= slots; ++slot) {
      in.close();
      in.open(slot == slots ? path : path + "." + std::to_string(slot), std::ios::binary);
      magic = 0; length = 0; savedAt = 0; std::fill(std::begin(p), std::end(p), 0);
      in.read(reinterpret_cast<char *>(&magic), sizeof(magic));
      in.read(reinterpret_cast<char *>(&savedAt), sizeof(savedAt));
      in.read(reinterpret_cast<char *>(p), sizeof(p));
      in.read(reinterpret_cast<char *>(&length), sizeof(length));
      if (!in || magic != 0x574E4432 || length > 64*1024 || p[0] < 0 || p[0] > 6 ||
          p[3] < p[1] || p[4] < p[2] || int64_t(p[3])-p[1] >= 8 || int64_t(p[4])-p[2] >= 8) continue;
      Plan plan{p[0], p[1], p[2], p[3], p[4]};
      // Never project an old field over an unrelated area or mix revisions.
      if (plan.key() != expected.key()) continue;
      Snapshot snapshot{std::make_shared<Field>(plan), std::string(length, '\0'), savedAt};
      in.read(snapshot.catalog.data(), length);
      in.read(reinterpret_cast<char *>(snapshot.field->rgba.data()), snapshot.field->rgba.size());
      uint64_t hash = 0;
      in.read(reinterpret_cast<char *>(&hash), sizeof(hash));
      if (!in || hash != checksum(*snapshot.field, snapshot.catalog) || in.peek() != std::char_traits<char>::eof()) continue;
      snapshot.field->received = (plan.right-plan.left+1)*(plan.bottom-plan.top+1);
      return snapshot;
    }
    return {};
  }
};
}
