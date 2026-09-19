#include "MapLibreCustomHost.hpp"
#include "WindCore.hpp"
#include "WindResources.hpp"
#include "WindFade.hpp"
#include "WindShaders.hpp"

#include <GLES3/gl3.h>
#include <android/log.h>
#include <chrono>
#include <jni.h>
#include <map>
#include <mutex>

struct State {
  std::mutex mutex;

  std::shared_ptr<maris::Field> field;
  std::shared_ptr<maris::Field> staging;

  int generation = 0;

  float opacity = .65f;
  float density = .6f;
  float speed = 1.f;

  bool lowMemory = false;
  float quality = 1.f;

  bool visible = true;
  bool fadedOut = true;
};

static std::mutex registryMutex;
static std::map<jlong, std::shared_ptr<State>> registry;
static jlong nextId = 1;

static maris::TileCache tileCache;

static std::shared_ptr<State> state(jlong id) {
  std::lock_guard<std::mutex> lock(registryMutex);

  auto it = registry.find(id);

  return it == registry.end()
      ? nullptr
      : it->second;
}

static GLuint program(const char *fragment) {
  GLuint shaders[2] = {
      glCreateShader(GL_VERTEX_SHADER),
      glCreateShader(GL_FRAGMENT_SHADER),
  };

  const char *sources[2] = {
      maris::glVertex,
      fragment,
  };

  GLuint p = glCreateProgram();

  for (int i = 0; i < 2; ++i) {
    glShaderSource(
        shaders[i],
        1,
        &sources[i],
        nullptr
    );

    glCompileShader(
        shaders[i]
    );

    GLint ok = GL_FALSE;

    glGetShaderiv(
        shaders[i],
        GL_COMPILE_STATUS,
        &ok
    );

    if (!ok) {
      char log[2048] = {};

      glGetShaderInfoLog(
          shaders[i],
          sizeof(log),
          nullptr,
          log
      );

      __android_log_print(
          ANDROID_LOG_ERROR,
          "MarisWind",
          "%s",
          log
      );

      glDeleteProgram(p);
      p = 0;

      break;
    }

    glAttachShader(
        p,
        shaders[i]
    );
  }

  if (p) {
    glLinkProgram(p);

    GLint ok = GL_FALSE;

    glGetProgramiv(
        p,
        GL_LINK_STATUS,
        &ok
    );

    if (!ok) {
      char log[2048] = {};

      glGetProgramInfoLog(
          p,
          sizeof(log),
          nullptr,
          log
      );

      __android_log_print(
          ANDROID_LOG_ERROR,
          "MarisWind",
          "%s",
          log
      );

      glDeleteProgram(p);
      p = 0;
    }
  }

  for (GLuint shader : shaders) {
    glDeleteShader(shader);
  }

  return p;
}

class Host final
    : public mbgl::style::CustomLayerHost {
  std::shared_ptr<State> s;

  std::shared_ptr<maris::Field> oldField;
  std::shared_ptr<maris::Field> transitionTarget;

  maris::WindFade fieldTransition;

  GLuint trails = 0;

  GLuint trailBuffer = 0;
  GLuint vao = 0;

  GLint opacityUniform = -1;

  maris::Particles particles;

  std::vector<maris::ClipVertex> trailMesh;

  maris::RenderStats stats;

  std::chrono::steady_clock::time_point previous{};

  maris::Quality quality;
  maris::WindFade fade;

  GLsync trailFence = nullptr;

  size_t trailBytes = 0;
  size_t gpuVertexCount = 0;

public:
  explicit Host(
      std::shared_ptr<State> state
  )
      : s(std::move(state)),
        quality(s->lowMemory) {}

  void initialize() override {
    /*
     * Preserve the GL state that MapLibre had
     * before our custom layer initializes.
     */
    GLint previousVao = 0;
    GLint previousBuffer = 0;
    GLint previousProgram = 0;

    glGetIntegerv(
        GL_VERTEX_ARRAY_BINDING,
        &previousVao
    );

    glGetIntegerv(
        GL_ARRAY_BUFFER_BINDING,
        &previousBuffer
    );

    glGetIntegerv(
        GL_CURRENT_PROGRAM,
        &previousProgram
    );

    trails =
        program(
            maris::glParticle
        );

    if (!trails) {
      return;
    }

    opacityUniform =
        glGetUniformLocation(
            trails,
            "opacity"
        );

    glGenBuffers(
        1,
        &trailBuffer
    );

    glGenVertexArrays(
        1,
        &vao
    );

    /*
     * Configure the VAO once.
     *
     * The VAO directly references trailBuffer.
     * No need for a second unused VBO.
     */
    glBindVertexArray(
        vao
    );

    glBindBuffer(
        GL_ARRAY_BUFFER,
        trailBuffer
    );

    glEnableVertexAttribArray(
        0
    );

    glVertexAttribPointer(
        0,
        4,
        GL_FLOAT,
        GL_FALSE,
        sizeof(maris::ClipVertex),
        nullptr
    );

    glEnableVertexAttribArray(
        1
    );

    glVertexAttribPointer(
        1,
        2,
        GL_FLOAT,
        GL_FALSE,
        sizeof(maris::ClipVertex),
        reinterpret_cast<void *>(
            4 * sizeof(float)
        )
    );

    /*
     * Restore MapLibre GL state.
     */
    glBindVertexArray(
        previousVao
    );

    glBindBuffer(
        GL_ARRAY_BUFFER,
        previousBuffer
    );

    glUseProgram(
        previousProgram
    );
  }

  void render(
      const mbgl::style::
          CustomLayerRenderParameters &p
  ) override {
    std::shared_ptr<maris::Field> field;

    float opacity;
    float density;
    float speed;
    bool visible;

    {
      std::lock_guard<std::mutex>
          lock(s->mutex);

      field = s->field;

      opacity = s->opacity;
      density = s->density;
      speed = s->speed;

      visible = s->visible;
    }

    if (!field) {
      oldField.reset();
      transitionTarget.reset();

      fade =
          maris::WindFade();

      {
        std::lock_guard<std::mutex>
            lock(s->mutex);

        s->fadedOut = true;
      }

      if (trailFence) {
        glDeleteSync(
            trailFence
        );

        trailFence = nullptr;
      }

      /*
       * Keep the buffer object itself alive.
       * Just clear logical contents.
       *
       * No need to delete/recreate the buffer
       * every time the field disappears.
       */
      trailBytes = 0;
      gpuVertexCount = 0;

      particles =
          maris::Particles();

      std::vector<
          maris::ClipVertex
      >().swap(
          trailMesh
      );

      previous = {};

      return;
    }

    const auto steadyNow =
        std::chrono::steady_clock::now();

    const double seconds =
        std::chrono::duration<double>(
            steadyNow.time_since_epoch()
        ).count();

    /*
     * IMPORTANT:
     *
     * fade.update() already returns the current
     * fade value.
     *
     * Don't multiply fade.value again later.
     */
    const float fadeValue =
        fade.update(
            visible,
            seconds
        );

    const float effectiveOpacity =
        opacity *
        fadeValue;

    {
      std::lock_guard<std::mutex>
          lock(s->mutex);

      s->fadedOut =
          fadeValue <= 0;
    }

    stats.begin();

    /*
     * Preserve the program currently owned by
     * MapLibre.
     *
     * This remains because the existing comment
     * indicates MapLibre 13.2 can otherwise leave
     * neighboring layers with the wrong program.
     *
     * If later profiling proves this glGet* stalls,
     * this is a candidate for a deeper MapLibre-
     * specific state fix.
     */
    GLint savedProgram = 0;

    glGetIntegerv(
        GL_CURRENT_PROGRAM,
        &savedProgram
    );

    if (
        transitionTarget !=
        field
    ) {
      oldField =
          transitionTarget;

      transitionTarget =
          field;

      fieldTransition =
          maris::WindFade();

      particles
          .invalidateTrails();
    }

    float progress =
        oldField
            ? fieldTransition
                  .update(
                      true,
                      seconds
                  )
            : 1.f;

    if (progress >= 1.f) {
      oldField.reset();
    }

    /*
     * Configure only the GL state actually
     * needed by the wind trail pass.
     */
    glDisable(
        GL_DEPTH_TEST
    );

    glDepthMask(
        GL_FALSE
    );

    glDisable(
        GL_STENCIL_TEST
    );

    glDisable(
        GL_CULL_FACE
    );

    glEnable(
        GL_BLEND
    );

    glBlendEquation(
        GL_FUNC_ADD
    );

    glBlendFunc(
        GL_ONE,
        GL_ONE_MINUS_SRC_ALPHA
    );

    const auto now =
        steadyNow;

    const double delta =
        previous
                .time_since_epoch()
                .count()
            ? std::chrono::
                  duration<double>(
                      now -
                      previous
                  )
                  .count()
            : 0.;

    const double dt =
        std::min(
            .05,
            delta
        );

    previous = now;

    quality.frame(
        delta
    );

    {
      std::lock_guard<std::mutex>
          lock(s->mutex);

      s->quality =
          quality.density;
    }

    const auto &lines =
        particles.update(
            *field,
            p.projectionMatrix.data(),
            p.zoom,
            dt,
            density *
                quality.density,
            speed,
            oldField.get(),
            progress
        );

    /*
     * Upload only when the particle trail mesh
     * actually changed.
     */
    if (
        trails &&
        particles
            .needsMeshRebuild()
    ) {
      GLint viewport[4] = {};

      glGetIntegerv(
          GL_VIEWPORT,
          viewport
      );

      maris::buildTrailMesh(
          lines,
          viewport[2],
          viewport[3],
          trailMesh
      );

      if (trailMesh.empty()) {
        gpuVertexCount = 0;

        particles
            .markMeshUploaded();
      } else {
        GLenum ready =
            trailFence
                ? glClientWaitSync(
                      trailFence,
                      0,
                      0
                  )
                : GL_ALREADY_SIGNALED;

        if (
            ready ==
                GL_ALREADY_SIGNALED ||
            ready ==
                GL_CONDITION_SATISFIED
        ) {
          if (trailFence) {
            glDeleteSync(
                trailFence
            );

            trailFence = nullptr;
          }

          const size_t bytes =
              trailMesh.size() *
              sizeof(
                  maris::ClipVertex
              );

          /*
           * Bind VAO once.
           *
           * Attribute pointers are already stored
           * in the VAO from initialize().
           */
          glBindVertexArray(
              vao
          );

          glBindBuffer(
              GL_ARRAY_BUFFER,
              trailBuffer
          );

          if (
              trailBytes <
              bytes
          ) {
            /*
             * Allocate/grow only when necessary.
             */
            glBufferData(
                GL_ARRAY_BUFFER,
                bytes,
                nullptr,
                GL_STREAM_DRAW
            );

            trailBytes =
                bytes;
          }

          /*
           * No glVertexAttribPointer here.
           * VAO already knows layout.
           */
          glBufferSubData(
              GL_ARRAY_BUFFER,
              0,
              bytes,
              trailMesh.data()
          );

          gpuVertexCount =
              trailMesh.size();

          particles
              .markMeshUploaded();

          trailFence =
              glFenceSync(
                  GL_SYNC_GPU_COMMANDS_COMPLETE,
                  0
              );
        }
      }
    }

    /*
     * Draw the currently resident GPU mesh.
     */
    if (
        trails &&
        gpuVertexCount > 0 &&
        effectiveOpacity > 0.f
    ) {
      glUseProgram(
          trails
      );

      if (
          opacityUniform >= 0
      ) {
        glUniform1f(
            opacityUniform,
            effectiveOpacity
        );
      }

      glBindVertexArray(
          vao
      );

      /*
       * No repeated glVertexAttribPointer calls.
       */
      glDrawArrays(
          GL_TRIANGLES,
          0,
          static_cast<GLsizei>(
              gpuVertexCount
          )
      );
    }

    /*
     * Restore enough GL state for MapLibre.
     */
    glBindVertexArray(
        0
    );

    glUseProgram(
        savedProgram
    );

#ifndef NDEBUG
    if (stats.end()) {
      const auto lookupMetrics =
          field
              ->consumeLookupMetrics();

      __android_log_print(
          ANDROID_LOG_INFO,
          "MarisWind",
          "render callbacks=%.1f/s "
          "cpu=%.3fms "
          "atlasBytes=%zu "
          "vertices=%zu "
          "samples/frame=%.1f "
          "directLookups=%llu "
          "avgTileLookupMs=%.4f",
          stats.fps,
          stats.averageCpuMs,
          field->rgba.size(),
          gpuVertexCount,
          lookupMetrics.samples /
              std::max(
                  1.,
                  stats.fps * 5.
              ),
          static_cast<
              unsigned long long
          >(
              lookupMetrics
                  .directLookups
          ),
          lookupMetrics
                  .timedLookups
              ? (
                    double(
                        lookupMetrics
                            .lookupNanos
                    ) /
                    lookupMetrics
                        .timedLookups
                ) /
                    1e6
              : 0.0
      );
    }
#endif
  }

  void contextLost() override {
    trails = 0;
    trailBuffer = 0;
    vao = 0;

    opacityUniform = -1;

    trailFence = nullptr;
    trailBytes = 0;
    gpuVertexCount = 0;

    oldField.reset();
    transitionTarget.reset();

    particles =
        maris::Particles();

    std::vector<
        maris::ClipVertex
    >().swap(
        trailMesh
    );

    previous = {};

    fade =
        maris::WindFade();
  }

  void deinitialize() override {
    if (trailFence) {
      glDeleteSync(
          trailFence
      );

      trailFence = nullptr;
    }

    if (trailBuffer) {
      glDeleteBuffers(
          1,
          &trailBuffer
      );

      trailBuffer = 0;
    }

    if (trails) {
      glDeleteProgram(
          trails
      );

      trails = 0;
    }

    if (vao) {
      glDeleteVertexArrays(
          1,
          &vao
      );

      vao = 0;
    }

    /*
     * Reset CPU/native state without trying to
     * delete the GL resources a second time.
     */
    opacityUniform = -1;
    trailBytes = 0;
    gpuVertexCount = 0;

    oldField.reset();
    transitionTarget.reset();

    particles =
        maris::Particles();

    std::vector<
        maris::ClipVertex
    >().swap(
        trailMesh
    );

    previous = {};

    fade =
        maris::WindFade();
  }
};

extern "C" {

JNIEXPORT jlongArray JNICALL
Java_com_maris_wind_WindControl_create(
    JNIEnv *env,
    jclass,
    jboolean lowMemory
) {
  auto s =
      std::make_shared<State>();

  s->lowMemory =
      lowMemory;

  s->quality =
      lowMemory
          ? .5f
          : 1.f;

  jlong id;

  {
    std::lock_guard<std::mutex>
        lock(registryMutex);

    id = nextId++;

    registry[id] =
        s;
  }

  jlong values[] = {
      id,
      reinterpret_cast<jlong>(
          new Host(s)
      )
  };

  auto result =
      env->NewLongArray(2);

  env->SetLongArrayRegion(
      result,
      0,
      2,
      values
  );

  return result;
}

JNIEXPORT void JNICALL
Java_com_maris_wind_WindControl_release(
    JNIEnv *,
    jclass,
    jlong id
) {
  std::lock_guard<std::mutex>
      lock(registryMutex);

  registry.erase(id);

  tileCache.clear();
}

JNIEXPORT jintArray JNICALL
Java_com_maris_wind_WindControl_plan(
    JNIEnv *env,
    jclass,
    jdouble w,
    jdouble south,
    jdouble e,
    jdouble north,
    jdouble zoom,
    jlong id
) {
  auto s =
      state(id);

  bool low = false;

  if (s) {
    std::lock_guard<std::mutex>
        lock(s->mutex);

    low =
        s->lowMemory ||
        s->quality < .7f;
  }

  auto p =
      maris::plan(
          w,
          south,
          e,
          north,
          std::min(
              6.,
              zoom
          ) -
              (
                  low
                      ? 1
                      : 0
              ),
          low
              ? 1024
              : 2048
      );

  jint values[] = {
      p.z,
      p.left,
      p.top,
      p.right,
      p.bottom
  };

  auto array =
      env->NewIntArray(5);

  env->SetIntArrayRegion(
      array,
      0,
      5,
      values
  );

  return array;
}

JNIEXPORT void JNICALL
Java_com_maris_wind_WindControl_begin(
    JNIEnv *env,
    jclass,
    jlong id,
    jint gen,
    jintArray array
) {
  auto s =
      state(id);

  if (!s)
    return;

  jint p[5];

  env->GetIntArrayRegion(
      array,
      0,
      5,
      p
  );

  std::lock_guard<std::mutex>
      lock(s->mutex);

  s->generation =
      gen;

  maris::Plan next{
      p[0],
      p[1],
      p[2],
      p[3],
      p[4]
  };

  if (
      s->field &&
      !maris::overlaps(
          s->field->plan,
          next
      )
  ) {
    s->field.reset();
  }

  s->staging =
      std::make_shared<
          maris::Field
      >(
          next
      );
}

JNIEXPORT jboolean JNICALL
Java_com_maris_wind_WindControl_cached(
    JNIEnv *env,
    jclass,
    jlong id,
    jint gen,
    jint x,
    jint y,
    jstring url
) {
  auto s =
      state(id);

  if (!s)
    return false;

  const char *text =
      env->GetStringUTFChars(
          url,
          nullptr
      );

  std::string key(
      text
  );

  env->ReleaseStringUTFChars(
      url,
      text
  );

  std::lock_guard<std::mutex>
      lock(s->mutex);

  return
      gen ==
          s->generation &&
      s->staging &&
      tileCache.copy(
          key,
          *s->staging,
          x,
          y
      );
}

JNIEXPORT void JNICALL
Java_com_maris_wind_WindControl_put(
    JNIEnv *env,
    jclass,
    jlong id,
    jint gen,
    jint x,
    jint y,
    jobject bytes,
    jstring url
) {
  auto s =
      state(id);

  if (!s)
    return;

  auto data =
      static_cast<uint8_t *>(
          env->GetDirectBufferAddress(
              bytes
          )
      );

  if (
      !data ||
      env->GetDirectBufferCapacity(
          bytes
      ) <
          256 * 256 * 4
  ) {
    return;
  }

  {
    std::lock_guard<std::mutex>
        lock(s->mutex);

    if (
        gen ==
            s->generation &&
        s->staging
    ) {
      s->staging
          ->put(
              x,
              y,
              data,
              1024
          );
    }
  }

  const char *text =
      env->GetStringUTFChars(
          url,
          nullptr
      );

  tileCache.put(
      text,
      data
  );

  env->ReleaseStringUTFChars(
      url,
      text
  );
}

JNIEXPORT jdouble JNICALL
Java_com_maris_wind_WindControl_speedAtCenter(
    JNIEnv *,
    jclass,
    jlong id,
    jdouble longitude,
    jdouble latitude
) {
  auto s =
      state(id);

  if (!s)
    return -1;

  std::lock_guard<std::mutex>
      lock(s->mutex);

  return maris::speedAtCoordinate(
      s->field.get(),
      longitude,
      latitude
  );
}

JNIEXPORT jboolean JNICALL
Java_com_maris_wind_WindControl_publish(
    JNIEnv *,
    jclass,
    jlong id,
    jint gen
) {
  auto s =
      state(id);

  if (!s)
    return false;

  std::lock_guard<std::mutex>
      lock(s->mutex);

  if (
      gen ==
          s->generation &&
      s->staging &&
      maris::canPublish(
          s->field.get(),
          *s->staging
      )
  ) {
    if (
        s->field &&
        s->field
                ->plan
                .key() ==
            s->staging
                ->plan
                .key() &&
        s->field->rgba ==
            s->staging
                ->rgba
    ) {
      s->staging.reset();

      return true;
    }

    s->field =
        std::move(
            s->staging
        );

    return true;
  }

  s->staging.reset();

  return false;
}

JNIEXPORT void JNICALL
Java_com_maris_wind_WindControl_configure(
    JNIEnv *,
    jclass,
    jlong id,
    jfloat opacity,
    jfloat density,
    jfloat speed,
    jboolean visible
) {
  auto s =
      state(id);

  if (!s)
    return;

  std::lock_guard<std::mutex>
      lock(s->mutex);

  s->opacity =
      opacity;

  s->density =
      density;

  s->speed =
      speed;

  s->visible =
      visible;
}

JNIEXPORT void JNICALL
Java_com_maris_wind_WindControl_setGrid(
    JNIEnv *env,
    jclass,
    jlong id,
    jdoubleArray boundsArray,
    jintArray dimensionsArray,
    jfloatArray uArray,
    jfloatArray vArray
) {
  auto s =
      state(id);

  if (
      !s ||
      !boundsArray ||
      !dimensionsArray ||
      !uArray ||
      !vArray
  ) {
    return;
  }

  const jsize boundsLength =
      env->GetArrayLength(
          boundsArray
      );

  const jsize dimensionsLength =
      env->GetArrayLength(
          dimensionsArray
      );

  if (
      boundsLength <= 0 ||
      boundsLength % 4 != 0 ||
      dimensionsLength !=
          boundsLength / 2
  ) {
    return;
  }

  std::vector<jdouble>
      rawBounds(
          size_t(boundsLength)
      );

  std::vector<jint>
      rawDimensions(
          size_t(dimensionsLength)
      );

  env->GetDoubleArrayRegion(
      boundsArray,
      0,
      boundsLength,
      rawBounds.data()
  );

  env->GetIntArrayRegion(
      dimensionsArray,
      0,
      dimensionsLength,
      rawDimensions.data()
  );

  std::vector<
      maris::GridTile
  > tiles;

  tiles.reserve(
      size_t(
          boundsLength / 4
      )
  );

  jsize totalCount = 0;

  for (
      jsize tileIndex = 0;
      tileIndex <
          boundsLength / 4;
      ++tileIndex
  ) {
    const int width =
        rawDimensions[
            size_t(
                tileIndex * 2
            )
        ];

    const int height =
        rawDimensions[
            size_t(
                tileIndex * 2 +
                1
            )
        ];

    if (
        width <= 0 ||
        height <= 0 ||
        !std::isfinite(
            rawBounds[
                size_t(
                    tileIndex * 4
                )
            ]
        ) ||
        !std::isfinite(
            rawBounds[
                size_t(
                    tileIndex * 4 +
                    1
                )
            ]
        ) ||
        !std::isfinite(
            rawBounds[
                size_t(
                    tileIndex * 4 +
                    2
                )
            ]
        ) ||
        !std::isfinite(
            rawBounds[
                size_t(
                    tileIndex * 4 +
                    3
                )
            ]
        )
    ) {
      return;
    }

    totalCount +=
        width *
        height;
  }

  if (
      env->GetArrayLength(
          uArray
      ) !=
          totalCount ||
      env->GetArrayLength(
          vArray
      ) !=
          totalCount
  ) {
    return;
  }

  std::vector<jfloat>
      rawU(
          size_t(totalCount)
      );

  std::vector<jfloat>
      rawV(
          size_t(totalCount)
      );

  env->GetFloatArrayRegion(
      uArray,
      0,
      totalCount,
      rawU.data()
  );

  env->GetFloatArrayRegion(
      vArray,
      0,
      totalCount,
      rawV.data()
  );

  jsize offset = 0;

  for (
      jsize tileIndex = 0;
      tileIndex <
          boundsLength / 4;
      ++tileIndex
  ) {
    const int width =
        rawDimensions[
            size_t(
                tileIndex * 2
            )
        ];

    const int height =
        rawDimensions[
            size_t(
                tileIndex * 2 +
                1
            )
        ];

    const jsize count =
        width *
        height;

    std::vector<float>
        u(
            size_t(count)
        );

    std::vector<float>
        v(
            size_t(count)
        );

    std::vector<uint8_t>
        valid(
            size_t(count),
            1
        );

    for (
        jsize i = 0;
        i < count;
        ++i
    ) {
      const float rawUValue =
          rawU[
              size_t(
                  offset + i
              )
          ];

      const float rawVValue =
          rawV[
              size_t(
                  offset + i
              )
          ];

      if (
          !std::isfinite(
              rawUValue
          ) ||
          !std::isfinite(
              rawVValue
          )
      ) {
        valid[
            size_t(i)
        ] = 0;

        continue;
      }

      u[
          size_t(i)
      ] = rawUValue;

      v[
          size_t(i)
      ] = rawVValue;
    }

    tiles.push_back(
        maris::GridTile{
            rawBounds[
                size_t(
                    tileIndex * 4
                )
            ],

            rawBounds[
                size_t(
                    tileIndex * 4 +
                    1
                )
            ],

            rawBounds[
                size_t(
                    tileIndex * 4 +
                    2
                )
            ],

            rawBounds[
                size_t(
                    tileIndex * 4 +
                    3
                )
            ],

            width,
            height,

            std::move(u),
            std::move(v),
            std::move(valid)
        }
    );

    offset +=
        count;
  }

  auto field =
      std::make_shared<
          maris::Field
      >(
          std::move(
              tiles
          )
      );

  std::lock_guard<std::mutex>
      lock(s->mutex);

  s->field =
      std::move(
          field
      );

  s->staging.reset();
}

JNIEXPORT jboolean JNICALL
Java_com_maris_wind_WindControl_upsertTile(
    JNIEnv *env,
    jclass,
    jlong id,
    jint z,
    jint x,
    jint y,
    jdoubleArray boundsArray,
    jint width,
    jint height,
    jfloatArray uArray,
    jfloatArray vArray
) {
  auto s = state(id);
  if (!s || !boundsArray || !uArray || !vArray ||
      width <= 0 || height <= 0 ||
      env->GetArrayLength(boundsArray) != 4 ||
      env->GetArrayLength(uArray) != width * height ||
      env->GetArrayLength(vArray) != width * height) {
    return false;
  }

  std::array<jdouble, 4> bounds{};
  env->GetDoubleArrayRegion(boundsArray, 0, 4, bounds.data());

  std::vector<jfloat> rawU(size_t(width * height));
  std::vector<jfloat> rawV(size_t(width * height));
  env->GetFloatArrayRegion(uArray, 0, width * height, rawU.data());
  env->GetFloatArrayRegion(vArray, 0, width * height, rawV.data());

  std::vector<float> u(size_t(width * height), 0.f);
  std::vector<float> v(size_t(width * height), 0.f);
  std::vector<uint8_t> valid(size_t(width * height), 1);
  for (int i = 0; i < width * height; ++i) {
    if (!std::isfinite(rawU[size_t(i)]) || !std::isfinite(rawV[size_t(i)])) {
      valid[size_t(i)] = 0;
      continue;
    }
    u[size_t(i)] = rawU[size_t(i)];
    v[size_t(i)] = rawV[size_t(i)];
  }

  maris::GridTile tile{
      bounds[0], bounds[1], bounds[2], bounds[3],
      width, height, std::move(u), std::move(v), std::move(valid)};
  tile.z = z;
  tile.x = x;
  tile.y = y;

  std::lock_guard<std::mutex> lock(s->mutex);
  if (!s->field) {
    std::vector<maris::GridTile> initial;
    initial.push_back(std::move(tile));
    s->field = std::make_shared<maris::Field>(std::move(initial));
    s->staging.reset();
    return true;
  }
  return s->field->upsertGridTile(std::move(tile));
}

JNIEXPORT void JNICALL
Java_com_maris_wind_WindControl_clearGrid(
    JNIEnv *,
    jclass,
    jlong id
) {
  auto s =
      state(id);

  if (!s)
    return;

  std::lock_guard<std::mutex>
      lock(s->mutex);

  s->field.reset();
  s->staging.reset();
}

JNIEXPORT jboolean JNICALL
Java_com_maris_wind_WindControl_fadedOut(
    JNIEnv *,
    jclass,
    jlong id
) {
  auto s =
      state(id);

  if (!s)
    return true;

  std::lock_guard<std::mutex>
      lock(s->mutex);

  return s->fadedOut;
}

JNIEXPORT jlong JNICALL
Java_com_maris_wind_WindControl_restore(
    JNIEnv *env,
    jclass,
    jlong id,
    jint gen,
    jstring path
) {
  auto s =
      state(id);

  if (!s)
    return 0;

  maris::Plan p;

  {
    std::lock_guard<std::mutex>
        lock(s->mutex);

    if (
        gen !=
            s->generation ||
        !s->staging ||
        s->field
    ) {
      return 0;
    }

    p =
        s->staging->plan;
  }

  const char *text =
      env->GetStringUTFChars(
          path,
          nullptr
      );

  auto snapshot =
      maris::SnapshotStore(
          text
      ).load(
          p
      );

  env->ReleaseStringUTFChars(
      path,
      text
  );

  if (!snapshot.field)
    return 0;

  std::lock_guard<std::mutex>
      lock(s->mutex);

  if (
      gen !=
      s->generation
  ) {
    return 0;
  }

  if (!s->field) {
    s->field =
        snapshot.field;
  }

  return snapshot.savedAt;
}

JNIEXPORT void JNICALL
Java_com_maris_wind_WindControl_save(
    JNIEnv *env,
    jclass,
    jlong id,
    jint gen,
    jstring path,
    jstring catalog,
    jlong now
) {
  auto s =
      state(id);

  if (!s)
    return;

  std::shared_ptr<
      maris::Field
  > field;

  {
    std::lock_guard<std::mutex>
        lock(s->mutex);

    if (
        gen !=
        s->generation
    ) {
      return;
    }

    field =
        s->staging;
  }

  if (!field)
    return;

  const char *p =
      env->GetStringUTFChars(
          path,
          nullptr
      );

  const char *c =
      env->GetStringUTFChars(
          catalog,
          nullptr
      );

  maris::SnapshotStore(
      p
  ).save(
      *field,
      c,
      now
  );

  env->ReleaseStringUTFChars(
      path,
      p
  );

  env->ReleaseStringUTFChars(
      catalog,
      c
  );
}

} // extern "C"
