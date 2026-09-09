import { deepEqual, equal, throws } from "node:assert/strict";
import test from "node:test";
import { analyzePrefix, cacheHitRate, runCacheExample } from "./model.ts";

test("CH uses all input buckets and has no value without input", () => {
  equal(cacheHitRate(1000, 8000, 1000), 80);
  equal(cacheHitRate(0, 0, 0), null);
  throws(() => cacheHitRate(-1, 10), RangeError);
  throws(() => cacheHitRate(1, Number.POSITIVE_INFINITY), RangeError);
});

test("appended content reuses the existing prefix but not new input", () => {
  const result = runCacheExample("append", 45000, 1000, true);
  equal(result.cacheRead, 50000);
  equal(result.totalInput, 51000);
  equal(result.uncachedInput, 1000);
  equal(result.matchedBlocks, 3);
  equal(result.hitRate, (50000 / 51000) * 100);
});

test("a changed block invalidates later identical blocks", () => {
  const changedTools = runCacheExample("tools", 45000, 1000, true);
  const changedSystem = runCacheExample("system", 45000, 1000, true);
  equal(changedTools.cacheRead, 0);
  equal(changedSystem.cacheRead, 3000);
  equal(changedSystem.matchedBlocks, 1);
  deepEqual(changedTools.previous.map((block) => block.signature), ["tools-v1", "system-v1", "history-45000"]);
});

test("compaction can lower both the hit ratio and total input", () => {
  const result = runCacheExample("compact", 45000, 1000, true);
  equal(result.totalInput, 8000);
  equal(result.cacheRead, 5000);
  equal(result.uncachedInput, 3000);
  equal(result.hitRate, 62.5);
});

test("replacing short history can preserve length but reduce cache reuse", () => {
  const appended = runCacheExample("append", 1000, 1000, true);
  const compacted = runCacheExample("compact", 1000, 1000, true);
  equal(appended.totalInput, 7000);
  equal(compacted.totalInput, 7000);
  equal(appended.cacheRead, 6000);
  equal(compacted.cacheRead, 5000);
});

test("matching content cannot hit unavailable cache", () => {
  const result = runCacheExample("append", 45000, 1000, false);
  equal(result.cacheRead, 0);
  equal(result.hitRate, 0);
  equal(result.uncachedInput, 51000);
  equal(analyzePrefix([], []).hitRate, null);
  throws(() => analyzePrefix([], [{ label: "bad", signature: "bad", tokens: Number.NaN }]), RangeError);
});
