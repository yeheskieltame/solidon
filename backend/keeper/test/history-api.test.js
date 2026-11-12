import { test } from "node:test";
import assert from "node:assert/strict";
import { thin } from "../src/api.js";

const pts = Array.from({ length: 1000 }, (_, i) => ({ t: i }));

test("thin keeps short histories as they are", () => {
  assert.deepEqual(thin(pts.slice(0, 10), 50), pts.slice(0, 10));
});

test("thin spreads points evenly and keeps the first and the newest", () => {
  const out = thin(pts, 101);
  assert.equal(out.length, 101);
  assert.equal(out[0].t, 0);
  assert.equal(out.at(-1).t, 999);
  assert.ok(out.every((p, i) => i === 0 || p.t > out[i - 1].t));
});

test("thin to one point returns the newest", () => {
  assert.deepEqual(thin(pts, 1), [{ t: 999 }]);
});
