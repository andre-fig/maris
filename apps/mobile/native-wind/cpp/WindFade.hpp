#pragma once
#include <algorithm>

namespace maris {
// Render-time fade: starts only when a field can actually be drawn. Reversing
// direction samples the current opacity instead of jumping back to an endpoint.
class WindFade {
  float from = 0, target = 0;
  double started = 0;
public:
  static constexpr double durationSeconds = .4;
  float value = 0;
  float update(bool visible, double now) {
    double t = std::clamp((now - started) / durationSeconds, 0., 1.);
    value = from + (target - from) * float(t * t * (3 - 2 * t));
    const float next = visible ? 1.f : 0.f;
    if (next != target) {
      from = value;
      target = next;
      started = now;
    }
    return value;
  }
};
}
