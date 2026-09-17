#include "WindFade.hpp"
#include <cassert>
#include <cmath>
#include <iostream>
int main() {
  maris::WindFade fade;
  assert(fade.update(true, 100) == 0); // Field arrives after a long load.
  assert(std::abs(fade.update(true, 100.2) - .5) < .001);
  assert(fade.update(true, 100.5) == 1);
  assert(fade.update(false, 101) == 1);
  auto midway = fade.update(false, 101.2);
  assert(std::abs(midway - .5) < .001);
  assert(std::abs(fade.update(true, 101.2) - midway) < .001);
  assert(fade.update(true, 101.4) > midway);
  assert(fade.update(true, 101.7) == 1);
  fade.update(false, 102);
  assert(fade.update(false, 102.5) == 0);
  fade = maris::WindFade(); // Layer recreated on foreground/context loss.
  assert(fade.update(true, 200) == 0);
  assert(fade.update(true, 200.2) > 0 && fade.value < 1);
  std::cout << "WindFade: entry, exit, reversal, delayed data and foreground reset passed\n";
}
