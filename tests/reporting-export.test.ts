import assert from "node:assert/strict";
import test from "node:test";
import { emptyCounters } from "../src/reporting/core.ts";
import { csvCell, metricsCsv } from "../src/reporting/export.ts";

test("metrics CSV is deterministic and escapes cells", () => {
  assert.equal(csvCell('a,"b'), '"a,""b"');
  const counters = { ...emptyCounters(), purchases: 2, revenueHuf: 12000 };
  assert.match(metricsCsv([{ day: "2026-09-25T00:00:00.000Z", counters }]), /2026-09-25,0,0,0,0,0,0,0,0,0,0,2,0,12000/);
});
