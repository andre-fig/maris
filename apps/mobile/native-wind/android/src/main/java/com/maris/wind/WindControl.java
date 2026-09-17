package com.maris.wind;
import android.graphics.*;
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
  static native boolean fadedOut(long id);
  static native double speedAtCenter(long id, double longitude, double latitude);
  com.facebook.react.bridge.ReadableArray sampleCoordinate;
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
          if (style.getLayer("miami-soundg-depth") != null)
            style.addLayerBelow(layer, "miami-soundg-depth");
          else if (style.getLayer("water_name_point_label") != null)
            style.addLayerBelow(layer, "water_name_point_label");
          else
            style.addLayer(layer);
        }
        configure(id, opacity, density, speed, true);
        if (nanos - checked > 350000000L) {
          checked = nanos;
          var b = map.getProjection().getVisibleRegion().latLngBounds;
          int[] p = plan(b.getLonWest(), b.getLatSouth(), b.getLonEast(),
                         b.getLatNorth(), map.getCameraPosition().zoom, id);
          String key = Arrays.toString(p);
          if (!key.equals(lastKey) || (!loading && nanos >= nextLoadAt)) {
            lastKey = key;
            loading = true;
            load(p, id, ++generation);
          }
        }
        map.triggerRepaint();
      }
    } else if (layer != null) {
      configure(id, opacity, density, speed, false);
      if (fadedOut(id)) remove();
      else if (map != null) map.triggerRepaint();
    }
    Choreographer.getInstance().postFrameCallback(this);
  }
  void dataStatus(boolean stale, long timestamp, int gen) {
    post(() -> {
      if (gen != generation) return;
      emitSample();
      WritableMap event = Arguments.createMap();
      event.putBoolean("stale", stale);
      event.putDouble("savedAt", timestamp * 1000.);
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
    cancelObsolete(gen);
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
          dataStatus(true, restored, gen);
          post(() -> { if (map != null && gen == generation) map.triggerRepaint(); });
        }
        boolean staleCatalog = false;
        String catalog;
        try {
          catalog = new String(fetch("https://beta.yr-maps.met.no/api/wind/available.json", gen), java.nio.charset.StandardCharsets.UTF_8);
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
          dataStatus(staleCatalog || !accepted || count != (p[3]-p[1]+1)*(p[4]-p[2]+1), savedAt, gen);
          post(() -> {
            if (map != null)
              map.triggerRepaint();
          });
          Log.i("MarisWind", "atlas tiles=" + count + " loadMs=" +
                                 (System.nanoTime() - start) / 1000000);
        }
      } catch (Exception error) {
        dataStatus(true, savedAt, gen);
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
