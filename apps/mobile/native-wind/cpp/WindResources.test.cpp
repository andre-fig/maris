#include "WindResources.hpp"
#include <cassert>
#include <filesystem>
#include <iostream>
#include <unistd.h>

int main() {
  maris::Quality fast;
  for (int i=0; i<600; ++i) fast.frame(1./60);
  assert(fast.density == 1 && fast.maxDimension() == 2048);
  for (int i=0; i<120; ++i) fast.frame(1./20);
  assert(fast.density < .7f && fast.zoomPenalty() == 1 && fast.maxDimension() == 1024);
  for (int i=0; i<3600; ++i) fast.frame(1./60);
  assert(fast.density > .9f);
  maris::Quality low(true);
  for (int i=0; i<3600; ++i) low.frame(1./60);
  assert(low.density == .5f && low.maxDimension() == 1024);
  auto plan = maris::plan(-180,-85,180,85,6,1024);
  assert(plan.width() <= 1024 && plan.height() <= 1024);
  char temporary[] = "/tmp/maris-wind-snapshot-XXXXXX";
  int fd = mkstemp(temporary); assert(fd >= 0); close(fd);
  maris::SnapshotStore store(temporary);
  maris::Plan p{0,0,0,0,0};
  assert(!store.load(p).field);
  maris::Field field(p);
  std::vector<uint8_t> tile(256*256*4, 255);
  field.put(0,0,tile.data(),1024);
  assert(store.save(field, "{\"times\":[]}", 1234));
  auto restored = store.load(p);
  assert(restored.field && restored.field->rgba == field.rgba && restored.savedAt == 1234);
  assert(!store.load({1,0,0,0,0}).field);
  maris::Field partial(p);
  assert(!store.save(partial,"invalid",5678));
  assert(store.load(p).savedAt == 1234);
  { std::fstream corrupt(std::string(temporary) + ".0",std::ios::in|std::ios::out|std::ios::binary);
    corrupt.seekp(100); corrupt.put(0); }
  assert(!store.load(p).field);
  assert(store.save(field,"{}",1234));
  std::filesystem::resize_file(std::string(temporary) + ".0", 20);
  assert(!store.load(p).field);
  std::remove(temporary);
  std::cout << "WindResources: FPS adaptation/recovery, low-memory tier, atlas bound, snapshot roundtrip, partial/corrupt/wrong-area rejection passed\n";
}
