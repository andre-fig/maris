#pragma once
#include <string>

namespace maris {
inline std::string metalShader() {
  return R"SHADER(
#include <metal_stdlib>
using namespace metal;
struct Input { packed_float4 clip; packed_float2 uv; };
struct Output { float4 clip [[position]]; float2 uv; };
vertex Output windVertex(uint id [[vertex_id]], const device Input* v [[buffer(0)]]) {
  Output o; o.clip = float4(v[id].clip); o.uv = float2(v[id].uv); return o;
}
fragment float4 particleFragment(Output in [[stage_in]], constant float& opacity [[buffer(0)]]) {
  float fade = pow(in.uv.x, 0.6);
  float a = min(fade * 1.2 * opacity, 1.0);
  return float4(float3(a), a);
}
)SHADER";
}

inline const char *glVertex = R"SHADER(#version 300 es
layout(location=0) in vec4 clip;
layout(location=1) in vec2 uv;
out vec2 texCoord;
void main(){gl_Position=clip;texCoord=uv;}
)SHADER";

inline const char *glParticle = R"SHADER(#version 300 es
precision highp float;in vec2 texCoord;out vec4 color;uniform float opacity;
void main(){float fade=pow(texCoord.x,0.6);float a=min(fade*1.2*opacity,1.0);color=vec4(vec3(a),a);}
)SHADER";
} // namespace maris
