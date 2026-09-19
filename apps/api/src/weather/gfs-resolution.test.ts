import assert from "node:assert/strict";
import { test } from "node:test";

import { downsampleGfsGrid } from "./gfs-resolution.js";

function grid() {
  const values = Array.from({ length: 41 * 41 }, (_, index) => index);
  return {
    model: "gfs" as const,
    run: "2026-09-19T00:00:00Z",
    forecastTime: "2026-09-19T00:00:00Z",
    forecastHour: 0,
    resolution: 0.25 as const,
    bounds: { north: 10, south: 0, east: 10, west: 0 },
    width: 41,
    height: 41,
    gridOrder: "north-to-south,west-to-east" as const,
    longitudeConvention: "-180..180" as const,
    units: {
      wind: "m/s" as const,
      temperature: "K" as const,
      precipitation: "kg/m2" as const,
      precipitationRate: "kg/m2/s" as const,
      cloudCover: "%" as const,
      pressure: "Pa" as const,
      gust: "m/s" as const,
      humidity: "%" as const,
    },
    fields: { windU: values, windV: values.map((value) => value * 2) },
  };
}

test("downsamples vector components independently and preserves bounds", () => {
  const source = grid();
  const half = downsampleGfsGrid(source, 0.5);
  const degree = downsampleGfsGrid(source, 1.0);

  assert.equal(half.width, 21);
  assert.equal(half.height, 21);
  assert.equal(degree.width, 11);
  assert.equal(degree.height, 11);
  assert.deepEqual(degree.bounds, source.bounds);
  assert.equal(half.fields.windU?.[0], 21);
  assert.equal(half.fields.windV?.[0], 42);
});

test("invalid values are ignored, but an all-invalid block remains invalid", () => {
  const source = grid();
  source.fields.windU![0] = null;
  source.fields.windU![1] = 4;
  source.fields.windU![41] = null;
  source.fields.windU![42] = null;
  const half = downsampleGfsGrid(source, 0.5);
  assert.equal(half.fields.windU?.[0], 4);

  source.fields.windV = new Array(41 * 41).fill(null);
  const degree = downsampleGfsGrid(source, 1.0);
  assert.equal(degree.fields.windV?.[0], null);
});
