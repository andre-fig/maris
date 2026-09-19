package com.maris.wind;
import android.graphics.*;
import android.os.SystemClock;
import android.util.Log;
import android.view.*;
import com.facebook.react.bridge.*;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.nio.ByteBuffer;
import java.util.Arrays;
import java.util.concurrent.*;
import okhttp3.*;
import org.json.*;
import org.maplibre.android.maps.*;
import org.maplibre.android.style.layers.CustomLayer;

public class WindControl extends View
    implements Choreographer.FrameCallback, LifecycleEventListener {
  static { System.loadLibrary("maris-wind"); }
  static native long[] create(boolean lowMemory);
  static native void release(long id);
  static native int[] plan(double west, double south, double east, double north,
                           double zoom, long id);
  static native void begin(long id, int gen, int[] p);
  static native void put(long id, int gen, int x, int y, ByteBuffer b,
                         String url);
  static native boolean cached(long id, int gen, int x, int y, String url);
  static native boolean publish(long id, int gen);
  static native void configure(long id, float opacity, float density,
                               float speed, boolean visible);
  static native void setGrid(long id, double[] tileBounds, int[] tileDimensions,
                             float[] u, float[] v);
  static native void clearGrid(long id);
  static native boolean fadedOut(long id);
  static native double speedAtCenter(long id, double longitude, double latitude);
  com.facebook.react.bridge.ReadableArray sampleCoordinate;
  ReadableMap windField;
  String appliedWindFieldKey;
  long perfSetGridCalls;
  long perfLastLogMs = SystemClock.uptimeMillis();
  void setWindField(ReadableMap value) {
    windField = value;
    appliedWindFieldKey = null;
    applyWindField();
  }
  void applyWindField() {
    if (id == 0) return;
    if (windField == null) {
      clearGrid(id);
      appliedWindFieldKey = "null";
      return;
    }
    ReadableArray tileValues = windField.getArray("tiles");
    if (tileValues == null || tileValues.size() == 0) return;
    String key = windField.hasKey("run") ? windField.getString("run") : "";
    key += "|" + (windField.hasKey("model") ? windField.getString("model") : "");
    key += "|" + (windField.hasKey("forecastTime") ? windField.getString("forecastTime") : "");
    // ReadableArray.toString() is not a content identity on all React Native
    // implementations. Build a stable key from the field metadata so camera
    // updates do not trigger another bridge transfer for the same tiles.
    for (int tileIndex = 0; tileIndex < tileValues.size(); tileIndex++) {
      ReadableMap tile = tileValues.getMap(tileIndex);
      ReadableMap bounds = tile.getMap("bounds");
      if (bounds == null) return;
      key += "|" + tileIndex + ":" + bounds.getDouble("west") + "," +
          bounds.getDouble("south") + "," + bounds.getDouble("east") + "," +
          bounds.getDouble("north") + ":" +
          tile.getInt("width") + "x" + tile.getInt("height");
    }
    if (key.equals(appliedWindFieldKey)) return;
    double[] tileBounds = new double[tileValues.size() * 4];
    int[] tileDimensions = new int[tileValues.size() * 2];
    int totalValues = 0;
    for (int tileIndex = 0; tileIndex < tileValues.size(); tileIndex++) {
      ReadableMap tile = tileValues.getMap(tileIndex);
      ReadableMap bounds = tile.getMap("bounds");
      int width = tile.hasKey("width") ? tile.getInt("width") : 0;
      int height = tile.hasKey("height") ? tile.getInt("height") : 0;
      ReadableArray uValues = tile.getArray("windU");
      ReadableArray vValues = tile.getArray("windV");
      if (bounds == null || width <= 0 || height <= 0 || uValues == null ||
          vValues == null || uValues.size() != width * height ||
          vValues.size() != width * height) return;
      int boundOffset = tileIndex * 4;
      tileBounds[boundOffset] = bounds.getDouble("west");
      tileBounds[boundOffset + 1] = bounds.getDouble("south");
      tileBounds[boundOffset + 2] = bounds.getDouble("east");
      tileBounds[boundOffset + 3] = bounds.getDouble("north");
      int dimensionOffset = tileIndex * 2;
      tileDimensions[dimensionOffset] = width;
      tileDimensions[dimensionOffset + 1] = height;
      totalValues += width * height;
    }
    float[] u = new float[totalValues], v = new float[totalValues];
    int valueOffset = 0;
    for (int tileIndex = 0; tileIndex < tileValues.size(); tileIndex++) {
      ReadableMap tile = tileValues.getMap(tileIndex);
      ReadableArray uValues = tile.getArray("windU");
      ReadableArray vValues = tile.getArray("windV");
      int width = tileDimensions[tileIndex * 2];
      int height = tileDimensions[tileIndex * 2 + 1];
      for (int i = 0; i < width * height; i++) {
        u[valueOffset + i] = uValues.isNull(i) ? Float.NaN : (float)uValues.getDouble(i);
        v[valueOffset + i] = vValues.isNull(i) ? Float.NaN : (float)vValues.getDouble(i);
      }
      valueOffset += width * height;
    }
    setGrid(id, tileBounds, tileDimensions, u, v);
    perfSetGridCalls++;
    long nowMs = SystemClock.uptimeMillis();
    if (nowMs - perfLastLogMs >= 1000) {
      Log.d("MarisWindPerf", "nativeSetGridPerSecond=" + perfSetGridCalls);
      perfSetGridCalls = 0;
      perfLastLogMs = nowMs;
    }
    appliedWindFieldKey = key;
    emitSample();
  }
  void emitSample() {
    if (sampleCoordinate == null || sampleCoordinate.size() != 2) return;
    double lon = sampleCoordinate.getDouble(0), lat = sampleCoordinate.getDouble(1);
    double value = speedAtCenter(id, lon, lat);
    WritableMap event = Arguments.createMap();
    if (value < 0) event.putNull("speed"); else event.putDouble("speed", value);
    com.facebook.react.bridge.WritableArray coordinate = Arguments.createArray();
    coordinate.pushDouble(lon); coordinate.pushDouble(lat);
    event.putArray("coordinate", coordinate);
    react.getJSModule(com.facebook.react.uimanager.events.RCTEventEmitter.class)
        .receiveEvent(getId(), "topCenterWind", event);
  }
  static native long restore(long id, int gen, String path);
  static native void save(long id, int gen, String path, String catalog, long now);
  boolean enabled = false, active = true, attached = false;
  final boolean benchmarkEnabled;
  float opacity = .65f, density = .6f, speed = 1;
  MapView mapView;
  MapLibreMap map;
  Style style;
  CustomLayer layer;
  long id = 0;
  volatile int generation = 0;
  String lastKey = "";
  long checked = 0, nextLoadAt = 0;
  boolean loading = false;
  boolean validationApplied = false;
  long validationAfter = 0;
  static final ExecutorService worker = Executors.newSingleThreadExecutor();
  final OkHttpClient http;
  final ReactContext react;
  final boolean lowMemory;
  final String snapshotPath;
  final String catalogPath;
  long savedAt = 0;
  WindControl(ReactContext context) {
    super(context);
    react = context;
    benchmarkEnabled = context.getCurrentActivity() != null &&
        context.getCurrentActivity().getIntent().getBooleanExtra("maris.wind.enabled", false);
    android.app.ActivityManager manager = (android.app.ActivityManager)context.getSystemService(android.content.Context.ACTIVITY_SERVICE);
    android.app.ActivityManager.MemoryInfo memory = new android.app.ActivityManager.MemoryInfo();
    manager.getMemoryInfo(memory);
    lowMemory = manager.isLowRamDevice() || memory.totalMem <= 3L*1024*1024*1024 || manager.getMemoryClass() <= 128;
    File directory = new File(context.getNoBackupFilesDir(), "maris-wind");
    directory.mkdirs();
    snapshotPath = new File(directory, "last-field.bin").getAbsolutePath();
    catalogPath = new File(directory, "last-catalog.json").getAbsolutePath();
    setVisibility(INVISIBLE);
    http = new OkHttpClient.Builder()
               .cache(new Cache(new File(context.getCacheDir(), "wind"),
                                32 * 1024 * 1024))
               .callTimeout(5, TimeUnit.SECONDS)
               .build();
    context.addLifecycleEventListener(this);
  }
  static MapView find(View view) {
    if (view instanceof MapView)
      return (MapView)view;
    if (view instanceof ViewGroup) {
      ViewGroup g = (ViewGroup)view;
      for (int i = 0; i < g.getChildCount(); i++) {
        MapView m = find(g.getChildAt(i));
        if (m != null)
          return m;
      }
    }
    return null;
  }
  @Override
  protected void onAttachedToWindow() {
    super.onAttachedToWindow();
    attached = true;
    Choreographer.getInstance().postFrameCallback(this);
  }
  @Override
  protected void onDetachedFromWindow() {
    attached = false;
    Choreographer.getInstance().removeFrameCallback(this);
    remove();
    super.onDetachedFromWindow();
  }
  void remove() {
    generation++;
    http.dispatcher().cancelAll();
    if (layer != null && style != null)
      try {
        style.removeLayer(layer);
      } catch (Exception ignored) {
      }
    layer = null;
    style = null;
    if (id != 0)
      release(id);
    id = 0;
    appliedWindFieldKey = null;
    lastKey = "";
    loading = false;
    nextLoadAt = 0;
  }
  public void doFrame(long nanos) {
    if (!attached || !active)
      return;
    if (enabled && active && opacity > 0) {
      if (mapView == null && getParent() instanceof View) {
        mapView = find((View)getParent());
        if (mapView != null)
          mapView.getMapAsync(m -> map = m);
      }
      if (map != null && map.getStyle() != null &&
          map.getStyle().isFullyLoaded()) {
        if (validationAfter == 0)
          validationAfter = nanos + 2000000000L;
        if (!validationApplied && nanos > validationAfter) {
          validationApplied = true;
          if ((react.getApplicationInfo().flags &
               android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE) != 0 &&
              react.getCurrentActivity() != null) {
            String fixture =
                react.getCurrentActivity().getIntent().getStringExtra(
                    "maris.wind.camera");
            if (fixture != null)
              try {
                String[] v = fixture.split(",");
                map.moveCamera(
                    org.maplibre.android.camera.CameraUpdateFactory
                        .newCameraPosition(
                            new org.maplibre.android.camera.CameraPosition
                                .Builder()
                                .target(new org.maplibre.android.geometry
                                            .LatLng(Double.parseDouble(v[1]),
                                                    Double.parseDouble(v[0])))
                                .zoom(Double.parseDouble(v[2]))
                                .bearing(Double.parseDouble(v[3]))
                                .tilt(Double.parseDouble(v[4]))
                                .build()));
              } catch (IllegalArgumentException error) {
                Log.w("MarisWind", "Invalid validation camera", error);
              }
          }
        }
        if (style != map.getStyle() || layer == null) {
          remove();
          style = map.getStyle();
          long[] handle = create(lowMemory);
          id = handle[0];
          layer = new CustomLayer("maris-native-wind", handle[1]);
          style.addLayer(layer);
          applyWindField();
        }
        configure(id, opacity, density, speed, true);
        // The React Native GFS client owns acquisition and cache coverage.
        // Native code only retains and samples the field it receives.
        map.triggerRepaint();
      }
    } else if (layer != null) {
      configure(id, opacity, density, speed, false);
      if (fadedOut(id)) remove();
      else if (map != null) map.triggerRepaint();
    }
    Choreographer.getInstance().postFrameCallback(this);
  }
  void dataStatus(boolean stale, long timestamp, boolean loading, int gen) {
    post(() -> {
      if (gen != generation) return;
      emitSample();
      WritableMap event = Arguments.createMap();
      event.putBoolean("stale", stale);
      event.putDouble("savedAt", timestamp * 1000.);
      event.putBoolean("loading", loading);
      react.getJSModule(com.facebook.react.uimanager.events.RCTEventEmitter.class)
          .receiveEvent(getId(), "topDataStatus", event);
    });
  }
  void cancelObsolete(int gen) {
    for (Call call : http.dispatcher().queuedCalls())
      if (!Integer.valueOf(gen).equals(call.request().tag())) call.cancel();
    for (Call call : http.dispatcher().runningCalls())
      if (!Integer.valueOf(gen).equals(call.request().tag())) call.cancel();
  }
  byte[] fetch(String url, int gen, boolean cacheOnly) throws Exception {
    Request.Builder builder = new Request.Builder()
                    .url(url)
                    .tag(Integer.valueOf(gen))
                    .header("User-Agent",
                            "Maris/1.0 (https://github.com/andre-fig/maris)");
    if (cacheOnly) builder.cacheControl(CacheControl.FORCE_CACHE);
    Request r = builder.build();
    try (Response response = http.newCall(r).execute()) {
      if (!response.isSuccessful() || response.body() == null)
        throw new Exception("MET HTTP " + response.code());
      return response.body().bytes();
    }
  }
  byte[] fetch(String url, int gen) throws Exception { return fetch(url, gen, false); }
  String savedCatalog() {
    try (FileInputStream in = new FileInputStream(catalogPath)) {
      byte[] bytes = new byte[(int) new File(catalogPath).length()];
      int read = in.read(bytes);
      return new String(bytes, 0, Math.max(0, read), java.nio.charset.StandardCharsets.UTF_8);
    } catch (Exception ignored) { return null; }
  }
  void saveCatalog(String catalog) {
    File tmp = new File(catalogPath + ".tmp");
    try (FileOutputStream out = new FileOutputStream(tmp)) {
      out.write(catalog.getBytes(java.nio.charset.StandardCharsets.UTF_8));
    } catch (Exception ignored) { return; }
    if (!tmp.renameTo(new File(catalogPath))) tmp.delete();
  }
  void load(int[] p, long target, int gen) {
    // Disabled: GFS grids are acquired, cached, and supplied by React Native.
    // Keep this legacy PNG loader unreachable so native never falls back to MET.
    return;
    /*
    cancelObsolete(gen);
    dataStatus(true, savedAt, true, gen);
    worker.submit(() -> {
      long start = System.nanoTime();
      boolean complete = false;
      try {
        if (gen != generation)
          return;
        begin(target, gen, p);
        long restored = restore(target, gen, snapshotPath);
        if (restored > 0) {
          savedAt = restored;
          dataStatus(true, restored, true, gen);
          post(() -> { if (map != null && gen == generation) map.triggerRepaint(); });
        }
        boolean staleCatalog = false;
        String catalog;
        try {
          catalog = null;
        } catch (Exception unavailable) {
          catalog = savedCatalog();
          staleCatalog = catalog != null;
          if (catalog == null) throw unavailable;
        }
        String source = new JSONObject(catalog)
                .getJSONArray("times")
                .getJSONObject(0)
                .getJSONObject("tiles")
                .getString("png");
        if (!staleCatalog) saveCatalog(catalog);
        if (gen != generation)
          return;
        int count = 0;
        boolean requestFailed = false;
        for (int y = p[2]; y <= p[4]; y++)
          for (int x = p[1]; x <= p[3]; x++) {
            if (gen != generation)
              return;
            int n = 1 << p[0], wrapped = (x % n + n) % n;
            try {
              String url = source.replace("{z}", "" + p[0])
                               .replace("{x}", "" + wrapped)
                               .replace("{y}", "" + y);
              if (cached(target, gen, x, y, url)) {
                count++;
                continue;
              }
              if (requestFailed) continue;
              // Persisted catalog URLs remain usable after reconnection.
              byte[] data = fetch(url, gen);
              BitmapFactory.Options options = new BitmapFactory.Options();
              options.inPreferredConfig = Bitmap.Config.ARGB_8888;
              options.inScaled = false;
              Bitmap bitmap =
                  BitmapFactory.decodeByteArray(data, 0, data.length, options);
              if (bitmap == null)
                continue;
              // MET PNGs are 16-bit: Android may choose RGBA_F16 despite
              // inPreferredConfig.
              if (bitmap.getConfig() != Bitmap.Config.ARGB_8888) {
                Bitmap rgba = bitmap.copy(Bitmap.Config.ARGB_8888, false);
                bitmap.recycle();
                bitmap = rgba;
              }
              if (bitmap == null)
                continue;
              if (bitmap.getWidth() == 256 && bitmap.getHeight() == 256) {
                ByteBuffer buffer = ByteBuffer.allocateDirect(256 * 256 * 4);
                bitmap.copyPixelsToBuffer(buffer);
                buffer.rewind();
                put(target, gen, x, y, buffer, url);
                count++;
              }
              bitmap.recycle();
            } catch (Exception error) {
              requestFailed = true;
              Log.w("MarisWind", "Tile unavailable", error);
            }
          }
        if (gen == generation) {
          long downloadedAt = System.currentTimeMillis() / 1000;
          save(target, gen, snapshotPath, catalog, downloadedAt);
          boolean accepted = publish(target, gen);
          complete = !staleCatalog && accepted && count == (p[3]-p[1]+1)*(p[4]-p[2]+1);
          if (accepted) savedAt = downloadedAt;
          dataStatus(staleCatalog || !accepted || count != (p[3]-p[1]+1)*(p[4]-p[2]+1), savedAt, false, gen);
          post(() -> {
            if (map != null)
              map.triggerRepaint();
          });
          Log.i("MarisWind", "atlas tiles=" + count + " loadMs=" +
                                 (System.nanoTime() - start) / 1000000);
        }
      } catch (Exception error) {
        dataStatus(true, savedAt, false, gen);
        Log.e("MarisWind", "MET field load failed", error);
      } finally {
        final boolean succeeded = complete;
        post(() -> {
          if (gen != generation) return;
          loading = false;
          nextLoadAt = System.nanoTime() + (succeeded ? 60000000000L : 5000000000L);
        });
      }
    });
    */
  }
  public void onHostResume() {
    active = true;
    Choreographer.getInstance().removeFrameCallback(this);
    if (attached) Choreographer.getInstance().postFrameCallback(this);
  }
  public void onHostPause() {
    active = false;
    Choreographer.getInstance().removeFrameCallback(this);
    remove();
  }
  public void onHostDestroy() { dispose(); }
  void dispose() {
    attached = false;
    generation++;
    Choreographer.getInstance().removeFrameCallback(this);
    remove();
    http.dispatcher().cancelAll();
    react.removeLifecycleEventListener(this);
  }
}
