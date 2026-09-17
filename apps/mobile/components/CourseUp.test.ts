import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { build } from "esbuild";
import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";

test("course up activates before heading is available and follows north without camera events", async () => {
  const require = createRequire(__filename);
  const directory = await mkdtemp(path.join(os.tmpdir(), "maris-course-up-"));
  const coordinate: [number, number] = [-80.16, 25.76];
  const jumps: Array<{ bearing: number }> = [];
  const flights: Array<{ bearing?: number }> = [];
  const fixture = {
    location: { coordinate, heading: null as number | null },
    camera: { jumpTo: (value: { bearing: number }) => jumps.push(value), flyTo: (value: { bearing?: number }) => flights.push(value) },
  };
  const globals = globalThis as typeof globalThis & {
    __courseUp?: typeof fixture; IS_REACT_ACT_ENVIRONMENT?: boolean;
  };
  const previous = globals.IS_REACT_ACT_ENVIRONMENT;
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  globals.__courseUp = fixture;
  let renderer: ReactTestRenderer | undefined;
  try {
    const output = await build({
      entryPoints: [path.join(__dirname, "../App.tsx")],
      bundle: true, write: false, platform: "node", format: "cjs", jsx: "automatic",
      plugins: [{ name: "camera-test-adapters", setup(builder) {
        builder.onResolve({ filter: /^react(?:\/jsx-runtime)?$/ }, args => ({ path: require.resolve(args.path), external: true }));
        builder.onResolve({ filter: /^(react-native|@maplibre\/maplibre-react-native|@maris\/native-wind|\.\/components\/.*|\.\/location\/.*|\.\/weather\/.*|\.\/offline\/.*)$/ }, args => ({ path: args.path, namespace: "mock" }));
        builder.onLoad({ filter: /.*/, namespace: "mock" }, args => {
          let contents: string;
          if (args.path === "react-native") contents = 'export const StyleSheet={create:x=>x}, View="View", useWindowDimensions=()=>({width:400});';
          else if (args.path === "@maplibre/maplibre-react-native") contents = `import React from "react"; export const Camera=React.forwardRef((props,ref)=>{React.useImperativeHandle(ref,()=>globalThis.__courseUp.camera);return null}); export const Map="Map", Layer="Layer", VectorSource="VectorSource", OfflineManager={setMaximumAmbientCacheSize:()=>Promise.resolve()};`;
          else if (args.path === "@maris/native-wind") contents = 'export const NativeWindLayer="NativeWindLayer";';
          else if (args.path.includes("/location/")) contents = 'export const useDeviceLocation=()=>globalThis.__courseUp.location;';
          else if (args.path.includes("/weather/")) contents = 'export const useCurrentViewportWeather=()=>({onTouchStart(){},onTouchEnd(){},onCameraChanging(){},onCameraDidChange(){}});';
          else if (args.path.includes("/offline/")) contents = 'export const MAP_AMBIENT_CACHE_BYTES=1;';
          else {
            const name = path.basename(args.path);
            contents = `export const ${name}="${name}";` + (name === "ScaleRuler" ? 'export const isWeatherScaleVisible=()=>true;' : '');
          }
          return { contents, loader: "js" };
        });
      }}],
    });
    const compiled = path.join(directory, "app.cjs");
    await writeFile(compiled, output.outputFiles[0].contents);
    const App = require(compiled).default;
    await act(async () => { renderer = create(React.createElement(App)); });
    const controls = () => renderer!.root.find(node => node.type === ("MapControlsPanel" as unknown));
    assert.equal(controls().props.locationActive, true);
    await act(async () => controls().props.onLocate());
    assert.equal(controls().props.courseUp, true, "selection must not require a heading sample");
    assert.equal(flights.at(-1)?.bearing, undefined, "do not fabricate north when heading is unavailable");
    assert.equal(jumps.length, 0);
    fixture.location = { coordinate, heading: 0 };
    await act(async () => renderer!.update(React.createElement(App)));
    assert.equal(jumps.at(-1)?.bearing, 0, "first valid north sample must not be discarded");
    fixture.location = { coordinate, heading: 32 };
    await act(async () => renderer!.update(React.createElement(App)));
    assert.equal(jumps.at(-1)?.bearing, 32);
    const compass = renderer!.root.find(node => node.type === ("CompassPanel" as unknown));
    await act(async () => compass.props.onPress());
    fixture.location = { coordinate, heading: 0 };
    await act(async () => renderer!.update(React.createElement(App)));
    await act(async () => controls().props.onLocate());
    assert.equal(controls().props.courseUp, true, "activate even if both bearings are already north");
    assert.equal(flights.at(-1)?.bearing, 0);
    fixture.location = { coordinate, heading: 45 };
    await act(async () => renderer!.update(React.createElement(App)));
    assert.equal(jumps.at(-1)?.bearing, 45, "no region-change callback is required to follow");
  } finally {
    if (renderer) await act(async () => renderer!.unmount());
    delete globals.__courseUp;
    globals.IS_REACT_ACT_ENVIRONMENT = previous;
    await rm(directory, { recursive: true, force: true });
  }
});
