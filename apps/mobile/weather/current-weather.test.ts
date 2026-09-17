import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { createRequire } from 'node:module';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { build } from 'esbuild';
import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import type { useCurrentViewportWeather } from './current-weather';

// Exercise the real hook and timers; only the native AppState adapter is mocked.
const testRequire = createRequire(__filename);
let directory: string, compiled: string;
before(async () => {
directory = await mkdtemp(path.join(os.tmpdir(), 'maris-weather-test-'));
const output = await build({
  entryPoints: [path.join(__dirname, 'current-weather.ts')],
  bundle: true, write: false, platform: 'node', format: 'cjs',
  plugins: [{ name: 'native-test-adapters', setup(builder) {
    builder.onResolve({filter:/^react$/}, () => ({path:testRequire.resolve('react'),external:true}));
    builder.onResolve({filter:/^react-native$/}, () => ({path:'native',namespace:'mock'}));
    builder.onLoad({filter:/.*/,namespace:'mock'}, () => ({contents:'export const AppState = globalThis.__weatherAppState;',loader:'js'}));
  }}],
});
compiled = path.join(directory,'weather.cjs');
await writeFile(compiled, output.outputFiles[0].contents);
});
after(() => rm(directory,{recursive:true,force:true}));

test('weather hook TTL, failed request retry, hidden/background/touch guards', async (t) => {
  t.mock.timers.enable({apis:['Date','setTimeout','setInterval'],now:1_000_000});
  let onState: (state:string)=>void = () => {};
  const native = {currentState:'active',addEventListener: (_:string, callback:typeof onState) => {
    onState=callback; return {remove() { onState=()=>{}; }};
  }};
  const globals = globalThis as typeof globalThis & {__weatherAppState?:typeof native; IS_REACT_ACT_ENVIRONMENT?:boolean};
  globals.__weatherAppState=native;
  globals.IS_REACT_ACT_ENVIRONMENT=true;
  const useWeather = testRequire(compiled).useCurrentViewportWeather as typeof useCurrentViewportWeather;
  let hook!: ReturnType<typeof useWeather>;
  let calls=0, fail=false;
  const previous=globalThis.fetch;
  globalThis.fetch = async () => {
    calls++;
    if(fail) throw new Error('offline');
    return new Response(JSON.stringify({temperature_celsius:25,latitude:25,longitude:-80}));
  };
  function Harness({enabled=true}:{enabled?:boolean}) {
    hook=useWeather('https://test.invalid',[-80,25],enabled);
    return null;
  }
  let renderer!:ReactTestRenderer;
  const tick = async (ms:number) => {
    for (let remaining=ms; remaining>0; remaining-=1000) {
      await act(async()=>{t.mock.timers.tick(Math.min(1000,remaining));});
    }
  };
  try {
    await act(async()=>{renderer=create(React.createElement(Harness));});
    await tick(1000);
    assert.equal(calls,1);
    await tick(599_000);
    assert.equal(calls,1);
    await tick(2_000);
    assert.equal(calls,2,'refresh without moving after TTL');
    fail=true;
    await act(async()=>hook.onCameraDidChange([-79,25]));
    await tick(1000);
    assert.equal(calls,3);
    fail=false;
    await act(async()=>hook.onCameraDidChange([-79,25]));
    await tick(1000);
    assert.equal(calls,4,'same failed coordinate retries without moving');
    fail=true;
    await act(async()=>hook.onCameraDidChange([-78,25]));
    await tick(1000);
    assert.equal(calls,5);
    fail=false;
    await tick(31_000);
    assert.equal(calls,6,'automatic retry after thirty seconds');
    await act(async()=>hook.onTouchStart());
    await tick(610_000);
    assert.equal(calls,6,'no refresh while touching');
    await act(async()=>hook.onTouchEnd(0));
    await tick(1000);
    assert.equal(calls,7);
    await act(async()=>onState('background'));
    await tick(610_000);
    assert.equal(calls,7);
    await act(async()=>onState('active'));
    await tick(1000);
    assert.equal(calls,8);
    await act(async()=>renderer.update(React.createElement(Harness,{enabled:false})));
    await tick(610_000);
    assert.equal(calls,8,'hidden weather never refreshes');
  } finally {
    if(renderer) await act(async()=>renderer.unmount());
    globalThis.fetch=previous;
    delete globals.__weatherAppState;
    delete globals.IS_REACT_ACT_ENVIRONMENT;
  }
});
