package com.maris.wind;
import com.facebook.react.uimanager.*;
import com.facebook.react.uimanager.annotations.ReactProp;
public class WindManager extends SimpleViewManager<WindControl> {
  @Override
  public java.util.Map<String, Object> getExportedCustomDirectEventTypeConstants() {
    return java.util.Collections.singletonMap("topDataStatus", java.util.Collections.singletonMap("registrationName", "onDataStatus"));
  }
  public String getName() { return "MarisWindControl"; }
  protected WindControl createViewInstance(ThemedReactContext context) {
    return new WindControl(context);
  }
  @ReactProp(name = "enabled")
  public void enabled(WindControl view, boolean value) {
    view.enabled = value || view.benchmarkEnabled;
  }
  @ReactProp(name = "opacity", defaultFloat = .65f)
  public void opacity(WindControl view, float value) {
    view.opacity = Math.max(0, Math.min(1, value));
  }
  @ReactProp(name = "density", defaultFloat = .6f)
  public void density(WindControl view, float value) {
    view.density = Math.max(0, Math.min(1, value));
  }
  @ReactProp(name = "animationSpeed", defaultFloat = 1)
  public void speed(WindControl view, float value) {
    view.speed = Math.max(0, value);
  }
  @Override
  public void onDropViewInstance(WindControl view) {
    view.dispose();
    super.onDropViewInstance(view);
  }
}
