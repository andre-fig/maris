#include "MapLibreCustomHost.hpp"
#include "WindCore.hpp"
#include "WindShaders.hpp"
#include <GLES3/gl3.h>
#include <android/log.h>
#include <chrono>
#include <jni.h>
#include <map>
#include <mutex>

struct State {
  std::mutex mutex;
  std::shared_ptr<maris::Field> field, staging;
  int generation = 0;
  float opacity = .65, density = .6, speed = 1;
};
static std::mutex registryMutex;
static std::map<jlong, std::shared_ptr<State>> registry;
static jlong nextId = 1;
static maris::TileCache tileCache;
static std::shared_ptr<State> state(jlong id) {
  std::lock_guard<std::mutex> lock(registryMutex);
  auto i = registry.find(id);
  return i == registry.end() ? nullptr : i->second;
}
static GLuint program(const char *fragment) {
  GLuint shaders[2] = {glCreateShader(GL_VERTEX_SHADER),
                       glCreateShader(GL_FRAGMENT_SHADER)};
  const char *sources[2] = {maris::glVertex, fragment};
  GLuint p = glCreateProgram();
  for (int i = 0; i < 2; i++) {
    glShaderSource(shaders[i], 1, &sources[i], nullptr);
    glCompileShader(shaders[i]);
    GLint ok;
    glGetShaderiv(shaders[i], GL_COMPILE_STATUS, &ok);
    if (!ok) {
      char log[2048];
      glGetShaderInfoLog(shaders[i], 2048, nullptr, log);
      __android_log_print(ANDROID_LOG_ERROR, "MarisWind", "%s", log);
      glDeleteProgram(p);
      p = 0;
      break;
    }
    glAttachShader(p, shaders[i]);
  }
  if (p) {
    glLinkProgram(p);
    GLint ok;
    glGetProgramiv(p, GL_LINK_STATUS, &ok);
    if (!ok) {
      glDeleteProgram(p);
      p = 0;
    }
  }
  for (auto s : shaders)
    glDeleteShader(s);
  return p;
}
class Host final : public mbgl::style::CustomLayerHost {
  std::shared_ptr<State> s;
  std::shared_ptr<maris::Field> uploaded;
  GLuint heat = 0, trails = 0, texture = 0, buffer = 0, vao = 0;
  maris::Particles particles;
  std::vector<maris::ClipVertex> trailMesh;
  maris::RenderStats stats;
  std::chrono::steady_clock::time_point previous{};
  float quality = 1;

public:
  explicit Host(std::shared_ptr<State> state) : s(std::move(state)) {}
  void initialize() override {
    heat = program(maris::glFragment().c_str());
    trails = program(maris::glParticle);
    glGenTextures(1, &texture);
    glGenBuffers(1, &buffer);
    glGenVertexArrays(1, &vao);
    glBindVertexArray(vao);
    glBindBuffer(GL_ARRAY_BUFFER, buffer);
    glEnableVertexAttribArray(0);
    glVertexAttribPointer(0, 4, GL_FLOAT, GL_FALSE, sizeof(maris::ClipVertex),
                          nullptr);
    glEnableVertexAttribArray(1);
    glVertexAttribPointer(1, 2, GL_FLOAT, GL_FALSE, sizeof(maris::ClipVertex),
                          (void *)(4 * sizeof(float)));
    glBindVertexArray(0);
  }
  void render(const mbgl::style::CustomLayerRenderParameters &p) override {
    std::shared_ptr<maris::Field> field;
    float opacity, density, speed;
    {
      std::lock_guard<std::mutex> lock(s->mutex);
      field = s->field;
      opacity = s->opacity;
      density = s->density;
      speed = s->speed;
    }
    if (!field || !heat)
      return;
    stats.begin();
    glActiveTexture(GL_TEXTURE0);
    glBindTexture(GL_TEXTURE_2D, texture);
    if (uploaded != field) {
      glPixelStorei(GL_UNPACK_ALIGNMENT, 1);
      glTexImage2D(GL_TEXTURE_2D, 0, GL_RGBA8, field->plan.width(),
                   field->plan.height(), 0, GL_RGBA, GL_UNSIGNED_BYTE,
                   field->rgba.data());
      glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_LINEAR);
      glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, GL_LINEAR);
      glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_S, GL_CLAMP_TO_EDGE);
      glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_T, GL_CLAMP_TO_EDGE);
      uploaded = field;
    }
    glDisable(GL_DEPTH_TEST);
    glDepthMask(GL_FALSE);
    glDisable(GL_STENCIL_TEST);
    glDisable(GL_CULL_FACE);
    glEnable(GL_BLEND);
    glBlendEquation(GL_FUNC_ADD);
    glBlendFuncSeparate(GL_DST_COLOR, GL_ONE_MINUS_SRC_ALPHA, GL_ONE,
                        GL_ONE_MINUS_SRC_ALPHA);
    glUseProgram(heat);
    glUniform1i(glGetUniformLocation(heat, "field"), 0);
    glUniform1f(glGetUniformLocation(heat, "opacity"), opacity);
    glBindVertexArray(vao);
    glBindBuffer(GL_ARRAY_BUFFER, buffer);
    auto vertices = maris::quad(field->plan, p.projectionMatrix.data(), p.zoom);
    glBufferData(GL_ARRAY_BUFFER, sizeof(vertices), vertices.data(),
                 GL_STREAM_DRAW);
    glDrawArrays(GL_TRIANGLE_STRIP, 0, 4);
    auto now = std::chrono::steady_clock::now();
    double dt =
        previous.time_since_epoch().count()
            ? std::min(.05,
                       std::chrono::duration<double>(now - previous).count())
            : 0;
    previous = now;
    quality = dt > .035 ? std::max(.2f, quality - .005f)
                        : std::min(1.f, quality + .001f);
    const auto &lines = particles.update(*field, p.projectionMatrix.data(),
                                         p.zoom, dt, density * quality, speed);
    if (!lines.empty() && trails) {
      GLint viewport[4];
      glGetIntegerv(GL_VIEWPORT, viewport);
      maris::buildTrailMesh(lines, viewport[2], viewport[3], trailMesh);
      glUseProgram(trails);
      glUniform1f(glGetUniformLocation(trails, "opacity"), opacity);
      glBlendFunc(GL_ONE, GL_ONE_MINUS_SRC_ALPHA);
      glBufferData(GL_ARRAY_BUFFER, trailMesh.size() * sizeof(maris::ClipVertex),
                   trailMesh.data(), GL_STREAM_DRAW);
      glDrawArrays(GL_TRIANGLES, 0, trailMesh.size());
    }
    glBindVertexArray(0);
#ifndef NDEBUG
    if (stats.end())
      __android_log_print(
          ANDROID_LOG_INFO, "MarisWind",
          "render callbacks=%.1f/s cpu=%.3fms atlasBytes=%zu vertices=%zu",
          stats.fps, stats.averageCpuMs, field->rgba.size(), lines.size());
#endif
  }
  void contextLost() override {
    heat = trails = texture = buffer = vao = 0;
    uploaded.reset();
    previous = {};
  }
  void deinitialize() override {
    if (heat)
      glDeleteProgram(heat);
    if (trails)
      glDeleteProgram(trails);
    if (texture)
      glDeleteTextures(1, &texture);
    if (buffer)
      glDeleteBuffers(1, &buffer);
    if (vao)
      glDeleteVertexArrays(1, &vao);
    contextLost();
  }
};
extern "C" {
JNIEXPORT jlongArray JNICALL Java_com_maris_wind_WindControl_create(JNIEnv *env,
                                                                    jclass) {
  auto s = std::make_shared<State>();
  jlong id;
  {
    std::lock_guard<std::mutex> lock(registryMutex);
    id = nextId++;
    registry[id] = s;
  }
  jlong values[] = {id, reinterpret_cast<jlong>(new Host(s))};
  auto result = env->NewLongArray(2);
  env->SetLongArrayRegion(result, 0, 2, values);
  return result;
}
JNIEXPORT void JNICALL Java_com_maris_wind_WindControl_release(JNIEnv *, jclass,
                                                               jlong id) {
  std::lock_guard<std::mutex> lock(registryMutex);
  registry.erase(id);
}
JNIEXPORT jintArray JNICALL Java_com_maris_wind_WindControl_plan(
    JNIEnv *env, jclass, jdouble w, jdouble south, jdouble e, jdouble north,
    jdouble zoom) {
  auto p = maris::plan(w, south, e, north, zoom);
  jint values[] = {p.z, p.left, p.top, p.right, p.bottom};
  auto a = env->NewIntArray(5);
  env->SetIntArrayRegion(a, 0, 5, values);
  return a;
}
JNIEXPORT void JNICALL Java_com_maris_wind_WindControl_begin(JNIEnv *env,
                                                             jclass, jlong id,
                                                             jint gen,
                                                             jintArray array) {
  auto s = state(id);
  if (!s)
    return;
  jint p[5];
  env->GetIntArrayRegion(array, 0, 5, p);
  std::lock_guard<std::mutex> lock(s->mutex);
  s->generation = gen;
  s->staging =
      std::make_shared<maris::Field>(maris::Plan{p[0], p[1], p[2], p[3], p[4]});
}
JNIEXPORT jboolean JNICALL Java_com_maris_wind_WindControl_cached(
    JNIEnv *env, jclass, jlong id, jint gen, jint x, jint y, jstring url) {
  auto s = state(id);
  if (!s)
    return false;
  const char *text = env->GetStringUTFChars(url, nullptr);
  std::string key(text);
  env->ReleaseStringUTFChars(url, text);
  std::lock_guard<std::mutex> lock(s->mutex);
  return gen == s->generation && s->staging &&
         tileCache.copy(key, *s->staging, x, y);
}
JNIEXPORT void JNICALL Java_com_maris_wind_WindControl_put(JNIEnv *env, jclass,
                                                           jlong id, jint gen,
                                                           jint x, jint y,
                                                           jobject bytes,
                                                           jstring url) {
  auto s = state(id);
  if (!s)
    return;
  auto data = static_cast<uint8_t *>(env->GetDirectBufferAddress(bytes));
  if (!data || env->GetDirectBufferCapacity(bytes) < 256 * 256 * 4)
    return;
  std::lock_guard<std::mutex> lock(s->mutex);
  if (gen == s->generation && s->staging)
    s->staging->put(x, y, data, 1024);
  const char *text = env->GetStringUTFChars(url, nullptr);
  tileCache.put(text, data);
  env->ReleaseStringUTFChars(url, text);
}
JNIEXPORT void JNICALL Java_com_maris_wind_WindControl_publish(JNIEnv *, jclass,
                                                               jlong id,
                                                               jint gen) {
  auto s = state(id);
  if (!s)
    return;
  std::lock_guard<std::mutex> lock(s->mutex);
  if (gen == s->generation && s->staging && s->staging->received) {
    s->field = std::move(s->staging);
  }
}
JNIEXPORT void JNICALL Java_com_maris_wind_WindControl_configure(
    JNIEnv *, jclass, jlong id, jfloat opacity, jfloat density, jfloat speed) {
  auto s = state(id);
  if (!s)
    return;
  std::lock_guard<std::mutex> lock(s->mutex);
  s->opacity = opacity;
  s->density = density;
  s->speed = speed;
}
}
