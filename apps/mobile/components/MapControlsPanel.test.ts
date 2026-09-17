import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { build } from "esbuild";
import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";

test("Android location icon loses its fill off GPS and preserves centered/course-up icons", async () => {
  const require = createRequire(__filename);
  const directory = await mkdtemp(path.join(os.tmpdir(), "maris-controls-test-"));
  let renderer: ReactTestRenderer | undefined;
  const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
  const previous = globals.IS_REACT_ACT_ENVIRONMENT;
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  try {
    const output = await build({
      entryPoints: [path.join(__dirname, "MapControlsPanel.tsx")],
      bundle: true, write: false, platform: "node", format: "cjs", jsx: "automatic",
      plugins: [{ name: "native-controls-adapters", setup(builder) {
        builder.onResolve({ filter: /^react(?:\/jsx-runtime)?$/ }, args => ({ path: require.resolve(args.path), external: true }));
        builder.onResolve({ filter: /^(react-native|expo-symbols|@expo\/vector-icons\/MaterialCommunityIcons|\.\/BlurPanel)$/ }, args => ({ path: args.path, namespace: "mock" }));
        builder.onLoad({ filter: /.*/, namespace: "mock" }, args => ({ loader: "js", contents:
          args.path === "react-native" ? 'export const Platform={OS:"android"}; export const StyleSheet={create:x=>x}; export const View="View", Pressable="Pressable";' :
          args.path === "expo-symbols" ? 'export const SymbolView="SymbolView";' :
          args.path === "./BlurPanel" ? 'export const BlurPanel="BlurPanel", BLUR_PANEL_ICON_SIZE=20;' :
          'export default "MaterialCommunityIcons";'
        }));
      }}],
    });
    const compiled = path.join(directory, "controls.cjs");
    await writeFile(compiled, output.outputFiles[0].contents);
    const { MapControlsPanel } = require(compiled);
    let presses = 0;
    let mapPresses = 0;
    const panel = (locationActive: boolean, courseUp: boolean) => React.createElement(MapControlsPanel, {
      locationActive, courseUp,
      onLocate: () => { presses++; },
      onMapPress: () => { mapPresses++; },
    });
    await act(async () => { renderer = create(panel(true, false)); });
    const icons = () => renderer!.root.findAll(node => node.type === ("MaterialCommunityIcons" as unknown));
    assert.equal(icons()[0].props.name, "near-me");
    await act(async () => { renderer!.update(panel(false, false)); });
    assert.equal(icons()[0].props.name, "navigation-variant-outline");
    assert.equal(icons()[1].props.name, "map-outline");
    await act(async () => { renderer!.update(panel(true, true)); });
    assert.equal(icons()[0].props.name, "navigation");
    await act(async () => { renderer!.update(panel(false, false)); });
    assert.equal(icons()[0].props.name, "navigation-variant-outline");
    renderer!.root.find(node => node.props.accessibilityLabel === "Centralizar na minha localização").props.onPress();
    assert.equal(presses, 1);
    renderer!.root.find(node => node.props.accessibilityLabel === "Abrir opções do mapa").props.onPress();
    assert.equal(mapPresses, 1);
  } finally {
    if (renderer) await act(async () => { renderer!.unmount(); });
    globals.IS_REACT_ACT_ENVIRONMENT = previous;
    await rm(directory, { recursive: true, force: true });
  }
});
