import assert from "node:assert/strict";
import test from "node:test";
import { buildFinanceTrend } from "../src/lib/finance/trend.ts";

test("builds a complete daily series including leap days and zero-value days", () => {
  const points = buildFinanceTrend(
    { start: "2024-02-01", end: "2024-02-29" },
    "day",
    {
      sales: [{ bucket: "2024-02-29", amount: "125.50" }],
      expenseTreatment: [
        { bucket: "2024-02-29", deducted: "15.00", notDeducted: "10.00" },
      ],
    },
  );

  assert.equal(points.length, 29);
  assert.equal(points[0]?.bucket, "2024-02-01");
  assert.equal(points[0]?.salesTotal, "0.00");
  assert.equal(points[0]?.expenseDeducted, "0.00");
  assert.equal(points[0]?.expenseNotDeducted, "0.00");
  assert.equal(points[28]?.bucket, "2024-02-29");
  assert.equal(points[28]?.label, "29");
  assert.equal(points[28]?.salesTotal, "125.50");
  assert.equal(points[28]?.expenseDeducted, "15.00");
  assert.equal(points[28]?.expenseNotDeducted, "10.00");
});

test("builds all twelve monthly buckets for a selected calendar year", () => {
  const points = buildFinanceTrend(
    { start: "2025-01-01", end: "2025-12-31" },
    "month",
    {
      sales: [{ bucket: "2025-07", amount: "900.00" }],
      expenseTreatment: [],
    },
  );

  assert.equal(points.length, 12);
  assert.equal(points[0]?.bucket, "2025-01");
  assert.equal(points[0]?.salesTotal, "0.00");
  assert.equal(points[6]?.salesTotal, "900.00");
  assert.equal(points[11]?.bucket, "2025-12");
});
