import assert from "node:assert/strict";
import test from "node:test";
import { buildFinanceTrend } from "../src/lib/finance/trend.ts";

test("builds a complete daily series including leap days and zero-value days", () => {
  const points = buildFinanceTrend(
    { start: "2024-02-01", end: "2024-02-29" },
    "day",
    {
      sales: [{ bucket: "2024-02-29", amount: "125.50" }],
      expensesIncurred: [{ bucket: "2024-02-29", amount: "25.00" }],
    },
  );

  assert.equal(points.length, 29);
  assert.equal(points[0]?.bucket, "2024-02-01");
  assert.equal(points[0]?.salesTotal, "0.00");
  assert.equal(points[0]?.expenseIncurred, "0.00");
  assert.equal(points[28]?.bucket, "2024-02-29");
  assert.equal(points[28]?.label, "29");
  assert.equal(points[28]?.salesTotal, "125.50");
  assert.equal(points[28]?.expenseIncurred, "25.00");
});

test("builds all twelve monthly buckets for a selected calendar year", () => {
  const points = buildFinanceTrend(
    { start: "2025-01-01", end: "2025-12-31" },
    "month",
    {
      sales: [{ bucket: "2025-07", amount: "900.00" }],
      expensesIncurred: [],
    },
  );

  assert.equal(points.length, 12);
  assert.equal(points[0]?.bucket, "2025-01");
  assert.equal(points[0]?.salesTotal, "0.00");
  assert.equal(points[6]?.salesTotal, "900.00");
  assert.equal(points[11]?.bucket, "2025-12");
});
