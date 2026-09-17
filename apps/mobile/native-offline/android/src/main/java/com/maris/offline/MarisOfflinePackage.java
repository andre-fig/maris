package com.maris.offline;

import com.facebook.react.ReactPackage;
import com.facebook.react.bridge.NativeModule;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.UiThreadUtil;
import com.facebook.react.uimanager.ViewManager;
import java.io.File;
import java.io.FileInputStream;
import java.io.ByteArrayOutputStream;
import java.util.Collections;
import java.util.List;
import okhttp3.MediaType;
import okhttp3.OkHttpClient;
import okhttp3.Protocol;
import okhttp3.Response;
import okhttp3.ResponseBody;
import org.maplibre.android.module.http.HttpRequestUtil;

/** Styles only: all tile/glyph/sprite downloading and storage remains MapLibre's. */
public final class MarisOfflinePackage implements ReactPackage {
  @Override public List<NativeModule> createNativeModules(ReactApplicationContext context) {
    UiThreadUtil.runOnUiThread(() -> install(context));
    return Collections.emptyList();
  }
  private void install(ReactApplicationContext context) {
    org.maplibre.android.MapLibre.getInstance(context);
    File root = new File(context.getFilesDir(), "offline-areas");
    HttpRequestUtil.setOkHttpClient(new OkHttpClient.Builder().addInterceptor(chain -> {
      if (!chain.request().url().host().equals("offline.maris.invalid")) return chain.proceed(chain.request());
      String name = chain.request().url().encodedPath().substring(1);
      if (!name.matches("[a-zA-Z0-9-]+\\.style\\.json")) throw new java.io.IOException("Invalid offline style path");
      File file = new File(root, name);
      boolean valid = file.isFile() && file.length() <= 4 * 1024 * 1024;
      ByteArrayOutputStream bytes = new ByteArrayOutputStream();
      if (valid) try (FileInputStream input = new FileInputStream(file)) {
        byte[] buffer = new byte[8192]; int read;
        while ((read = input.read(buffer)) != -1) bytes.write(buffer, 0, read);
      }
      byte[] body = bytes.toByteArray();
      return new Response.Builder().request(chain.request()).protocol(Protocol.HTTP_1_1)
        .code(valid ? 200 : 404).message(valid ? "OK" : "Offline style missing")
        .header("Cache-Control", valid ? "max-age=31536000, immutable" : "no-store")
        .body(ResponseBody.create(MediaType.parse("application/json"), body)).build();
    }).build());
  }
  @Override public List<ViewManager> createViewManagers(ReactApplicationContext context) {return Collections.emptyList();}
}
