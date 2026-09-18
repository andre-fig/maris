import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";
import { build } from "esbuild";
import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";

test("wind width and fade use the shared transition when speed arrives, disappears or changes width", async () => {
  const require = createRequire(__filename);
  const globals = globalThis as typeof globalThis & {
    IS_REACT_ACT_ENVIRONMENT?: boolean;
    __panelAnimations?: { toValue: number; duration: number; stopped: boolean }[];
  };
  const previousAct = globals.IS_REACT_ACT_ENVIRONMENT;
  const previousAnimations = globals.__panelAnimations;
  const animations: NonNullable<typeof globals.__panelAnimations> = [];
  globals.__panelAnimations = animations;
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  let renderer: ReactTestRenderer | undefined;
  try {
    const output = await build({ entryPoints: [require.resolve("./WindPanel.tsx")],
      bundle: true, write: false, platform: "node", format: "cjs", jsx: "automatic",
      plugins: [{ name: "panel-adapters", setup(builder) {
        builder.onResolve({ filter: /^react(?:\/jsx-runtime)?$/ }, args => ({ path: require.resolve(args.path), external: true }));
        builder.onResolve({ filter: /^(react-native|expo-symbols|\.\/BlurPanel|\.\/BlurText)$/ }, args => ({ path: args.path, namespace: "mock" }));
        builder.onLoad({ filter: /.*/, namespace: "mock" }, ({ path }) => ({ loader: "js", contents:
          path === "react-native" ? `export const View="View",Pressable="Pressable",StyleSheet={create:x=>x},Easing={cubic:x=>x,inOut:x=>x},useWindowDimensions=()=>({width:400});
            export const Animated={View:"AnimatedView",Value:class {constructor(value){this.value=value} interpolate(options){return {value:this,options}}},timing:(value,options)=>{const record={...options,stopped:false};globalThis.__panelAnimations.push(record);return {start(){value.value=options.toValue},stop(){record.stopped=true}}}};` :
          path === "expo-symbols" ? 'export const SymbolView="SymbolView";' :
          path === "./BlurPanel" ? 'export const BlurPanel="BlurPanel",BLUR_PANEL_ICON_SIZE=28,BLUR_PANEL_PADDING_VERTICAL=6;' :
          'export const BlurText="BlurText",BLUR_TEXT_LINE_HEIGHT=22;'
        }));
      }}],
    });
    const module = { exports: {} as { WindPanel: React.ComponentType<any> } };
    new Function("require", "module", "exports", output.outputFiles[0].text)(require, module, module.exports);
    const panel = (currentWindSpeed?: number, enabled = false) => React.createElement(module.exports.WindPanel, { currentWindSpeed, enabled, onToggle() {} });
    await act(async () => { renderer = create(panel()); });
    const content = () => renderer!.root.findAllByType("AnimatedView" as any).find(node => Array.isArray(node.props.style) && node.props.style[1]?.width)!;
    const header = () => renderer!.root.findByType("Pressable" as any);
    const headerMeasurement = () => renderer!.root.findByProps({ testID: "wind-header-measurement" });
    assert.equal(header().props.onLayout, undefined, "animated content must not feed widths back into the target");
    assert.equal(headerMeasurement().parent!.props.style[1].width, 400, "measurement is independent of animated width");
    assert.equal(content().props.style[1].width.value, 28);
    await act(async () => headerMeasurement().props.onLayout({ nativeEvent: { layout: { width: 90 } } }));
    assert.equal(content().props.style[1].width.value, 28);
    await act(async () => renderer!.update(panel(5)));
    assert.equal(content().props.style[1].width.value, 90);
    const expansion = animations.findLast(a => a.toValue === 90)!;
    assert.equal(expansion.duration, 280);
    await act(async () => renderer!.update(panel()));
    assert.equal(content().props.style[1].width.value, 28);
    assert.equal(expansion.stopped, true, "cancel the previous transition before retargeting");
    await act(async () => renderer!.update(panel(undefined, true)));
    assert.equal(content().props.style[1].width.value, 90, "legend remains expanded without API speed");
    await act(async () => headerMeasurement().props.onLayout({ nativeEvent: { layout: { width: 110 } } }));
    assert.equal(content().props.style[1].width.value, 110);
    assert.ok(animations.every(a => a.duration === 280), "width, height and fade share a single timing");
    const count = animations.length;
    await act(async () => headerMeasurement().props.onLayout({ nativeEvent: { layout: { width: 109.8 } } }));
    assert.equal(animations.length, count, "subpixel layout noise must not retarget the transition");
    await act(async () => renderer!.update(panel(undefined, true)));
    assert.equal(animations.length, count, "unchanged sizes must not restart animations");
  } finally {
    if (renderer) await act(async () => renderer!.unmount());
    globals.IS_REACT_ACT_ENVIRONMENT = previousAct;
    globals.__panelAnimations = previousAnimations;
  }
});
