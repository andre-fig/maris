#pragma once
#include <array>
// ABI interface extracted without modification of members or vtable order from:
// maplibre-native android-v13.2.0/include/mbgl/style/layers/custom_layer.hpp
// and custom_layer_render_parameters.hpp. Pin SDK 13.2.0. MapLibre BSD license.
namespace mbgl {
class PaintParameters;
namespace style {
struct CustomLayerRenderParameters {
  double width;
  double height;
  double latitude;
  double longitude;
  double zoom;
  double bearing;
  double pitch;
  double fieldOfView;
  std::array<double, 16> projectionMatrix;
  CustomLayerRenderParameters(const PaintParameters &);
};
class CustomLayerHost {
public:
  virtual ~CustomLayerHost() = default;
  virtual void initialize() = 0;
  virtual void render(const mbgl::style::CustomLayerRenderParameters &) = 0;
  virtual void contextLost() = 0;
  virtual void deinitialize() = 0;
};
} // namespace style
} // namespace mbgl
