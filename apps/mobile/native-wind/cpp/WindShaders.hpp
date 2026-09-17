#pragma once
#include <string>
namespace maris {
// Gradient and vector encoding adapted from NRK yr-map-docs (MIT), see
// LICENSE-NRK.
inline const char *gradient = R"SHADER(
float3 windColor(float s) {
  float3 a=float3(167,206,161)/255.0, b=float3(121,204,172)/255.0;
  if(s<5.5)return mix(a,b,clamp(s/5.5,0.0,1.0));
  a=b;b=float3(60,190,190)/255.0;if(s<8.0)return mix(a,b,(s-5.5)/2.5);
  a=b;b=float3(19,168,214)/255.0;if(s<10.8)return mix(a,b,(s-8.0)/2.8);
  a=b;b=float3(75,135,234)/255.0;if(s<13.9)return mix(a,b,(s-10.8)/3.1);
  a=b;b=float3(123,87,237)/255.0;if(s<17.2)return mix(a,b,(s-13.9)/3.3);
  a=b;b=float3(112,67,168)/255.0;if(s<20.8)return mix(a,b,(s-17.2)/3.6);
  a=b;b=float3(91,39,141)/255.0;if(s<24.5)return mix(a,b,(s-20.8)/3.7);
  a=b;b=float3(77,10,108)/255.0;if(s<28.5)return mix(a,b,(s-24.5)/4.0);
  a=b;b=float3(49,0,71)/255.0;return mix(a,b,clamp((s-28.5)/4.1,0.0,1.0));
}
)SHADER";
inline std::string metalShader() {
  return std::string(R"SHADER(
#include <metal_stdlib>
using namespace metal;
struct Input { packed_float4 clip; packed_float2 uv; };
struct Output { float4 clip [[position]]; float2 uv; };
vertex Output windVertex(uint id [[vertex_id]],const device Input* v [[buffer(0)]]) {
  Output o; o.clip=float4(v[id].clip);o.uv=float2(v[id].uv);return o;
}
)SHADER") +
         gradient + R"SHADER(
fragment float4 windFragment(Output in [[stage_in]],texture2d<float> field [[texture(0)]],constant float& opacity [[buffer(0)]]) {
  constexpr sampler s(coord::normalized,filter::linear,address::clamp_to_zero);
  float4 raw=field.sample(s,in.uv);
  if(raw.a<0.999)discard_fragment();
  float2 direction=(raw.rg*255.0-128.0)/2.0;
  return float4(windColor(length(direction))*opacity,opacity);
}
fragment float4 particleFragment(Output in [[stage_in]],constant float& opacity [[buffer(0)]]) {
  float a=in.uv.x*.9*opacity;return float4(float3(a),a);
}
)SHADER";
}
inline const char *glVertex = R"SHADER(#version 300 es
layout(location=0) in vec4 clip;
layout(location=1) in vec2 uv;
out vec2 texCoord;
void main(){gl_Position=clip;texCoord=uv;}
)SHADER";
inline std::string glFragment() {
  return std::string(R"SHADER(#version 300 es
precision highp float;
#define float3 vec3
in vec2 texCoord;uniform sampler2D field;uniform float opacity;out vec4 color;
)SHADER") +
         gradient + R"SHADER(
void main(){vec4 raw=texture(field,texCoord);if(raw.a<.999)discard;
vec2 direction=(raw.rg*255.0-128.0)/2.0;
color=vec4(windColor(length(direction))*opacity,opacity);}
)SHADER";
}
inline const char *glParticle = R"SHADER(#version 300 es
precision highp float;in vec2 texCoord;out vec4 color;uniform float opacity;
void main(){float a=texCoord.x*.9*opacity;color=vec4(vec3(a),a);}
)SHADER";
} // namespace maris
