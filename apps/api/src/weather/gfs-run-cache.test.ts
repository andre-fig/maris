import assert from "node:assert/strict";
import { test } from "node:test";

import { GfsService } from "./gfs.service.js";

type InventoryLookup = (hours: number[]) => Promise<unknown>;

function serviceWithTtl(
  ttlMs = 5 * 60 * 1_000,
  negativeTtlMs = 3 * 60 * 1_000,
) {
  return new GfsService({
    get<T>(key: string, fallback?: T) {
      if (key === "GFS_RUN_CACHE_TTL_MS") return ttlMs as T;
      if (key === "GFS_NEGATIVE_RUN_CACHE_TTL_MS") return negativeTtlMs as T;
      return fallback as T;
    },
  } as never);
}

function inventoryHtml(hours: number[] = [0]) {
  const files = hours.map((hour) =>
    `<option value="gfs.t00z.pgrb2.0p25.f${String(hour).padStart(3, "0")}">`,
  );
  return files.join("\n");
}

async function lookup(service: GfsService, hours: number[]) {
  return (service as unknown as { findCompleteInventory: InventoryLookup })
    .findCompleteInventory(hours);
}

test("first run lookup misses, stores, and the next tile lookup hits memory", async () => {
  const service = serviceWithTtl();
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return { ok: true, status: 200, text: async () => inventoryHtml() } as Response;
  };
  try {
    const first = await lookup(service, [0]);
    const second = await lookup(service, [0]);
    assert.equal(first, second);
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("multiple forecast-hour requests reuse a cached run when its files support them", async () => {
  const service = serviceWithTtl();
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return { ok: true, status: 200, text: async () => inventoryHtml([0, 3]) } as Response;
  };
  try {
    await lookup(service, [0]);
    await lookup(service, [3]);
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("expired run cache performs a new inventory lookup", async () => {
  const service = serviceWithTtl(1);
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return { ok: true, status: 200, text: async () => inventoryHtml() } as Response;
  };
  try {
    await lookup(service, [0]);
    await new Promise((resolve) => setTimeout(resolve, 5));
    await lookup(service, [0]);
    assert.equal(calls, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("invalid inventory is not stored as a valid run", async () => {
  const service = serviceWithTtl();
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return { ok: false, status: 500, text: async () => "" } as Response;
  };
  try {
    await assert.rejects(() => lookup(service, [0]), /No complete GFS run/);
    const callsAfterFirstLookup = calls;
    await assert.rejects(() => lookup(service, [0]), /No complete GFS run/);
    assert.equal(calls, callsAfterFirstLookup);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("an unavailable latest run is skipped and an older run can be used", async () => {
  const service = serviceWithTtl();
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    if (calls === 1) {
      return { ok: false, status: 500, text: async () => "" } as Response;
    }
    return { ok: true, status: 200, text: async () => inventoryHtml() } as Response;
  };
  try {
    const inventory = await lookup(service, [0]);
    assert.equal(inventory.files.size, 1);
    assert.equal(calls, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("negative cache expiry allows a previously unavailable run to be retried", async () => {
  const service = serviceWithTtl(1, 1);
  const originalFetch = globalThis.fetch;
  let calls = 0;
  let shouldFail = true;
  globalThis.fetch = async () => {
    calls += 1;
    return {
      ok: !shouldFail,
      status: shouldFail ? 500 : 200,
      text: async () => (shouldFail ? "" : inventoryHtml()),
    } as Response;
  };
  try {
    await assert.rejects(() => lookup(service, [0]), /No complete GFS run/);
    const callsAfterFirstLookup = calls;
    shouldFail = false;
    await new Promise((resolve) => setTimeout(resolve, 5));
    await lookup(service, [0]);
    assert.ok(calls > callsAfterFirstLookup);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("a cached valid run remains available and is not replaced by an invalid lookup", async () => {
  const service = serviceWithTtl();
  const originalFetch = globalThis.fetch;
  let valid = true;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return valid
      ? { ok: true, status: 200, text: async () => inventoryHtml([0]) } as Response
      : { ok: false, status: 500, text: async () => "" } as Response;
  };
  try {
    const first = await lookup(service, [0]);
    valid = false;
    const second = await lookup(service, [0]);
    assert.equal(first, second);
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("concurrent cache misses share one run discovery", async () => {
  const service = serviceWithTtl();
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    await new Promise((resolve) => setTimeout(resolve, 20));
    return { ok: true, status: 200, text: async () => inventoryHtml() } as Response;
  };
  try {
    const results = await Promise.all(
      Array.from({ length: 10 }, () => lookup(service, [0])),
    );
    assert.equal(calls, 1);
    assert.ok(results.every((result) => result === results[0]));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("a failed single-flight discovery is shared and cleared for a later retry", async () => {
  const service = serviceWithTtl(5 * 60 * 1_000, 1);
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    await new Promise((resolve) => setTimeout(resolve, 10));
    return { ok: false, status: 500, text: async () => "" } as Response;
  };
  try {
    const firstBatch = await Promise.allSettled(
      Array.from({ length: 10 }, () => lookup(service, [0])),
    );
    assert.ok(firstBatch.every((result) => result.status === "rejected"));
    const callsAfterFirstBatch = calls;

    await new Promise((resolve) => setTimeout(resolve, 5));
    await assert.rejects(() => lookup(service, [0]), /No complete GFS run/);
    assert.ok(calls > callsAfterFirstBatch);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
