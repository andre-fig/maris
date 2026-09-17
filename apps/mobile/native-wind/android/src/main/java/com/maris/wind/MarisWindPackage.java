package com.maris.wind;
import com.facebook.react.ReactPackage;
import com.facebook.react.bridge.NativeModule;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.uimanager.ViewManager;
import java.util.*;
public class MarisWindPackage implements ReactPackage {
  public List<NativeModule>
  createNativeModules(ReactApplicationContext context) {
    return Collections.emptyList();
  }
  public List<ViewManager> createViewManagers(ReactApplicationContext context) {
    return Collections.singletonList(new WindManager());
  }
}
