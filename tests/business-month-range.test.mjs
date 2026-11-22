import assert from "node:assert/strict";
import test from "node:test";
import {
  businessYearRange,
  businessMonthRange,
  currentMonthInPanama,
  isValidBusinessMonth,
  isValidBusinessYear,
} from "../src/lib/finance/dates.ts";

test("calculates the correct last day for calendar months", () => {
  assert.deepEqual(businessMonthRange("2025-02"), {
    start: "2025-02-01",
    end: "2025-02-28",
  });
  assert.deepEqual(businessMonthRange("2024-02"), {
    start: "2024-02-01",
    end: "2024-02-29",
  });
  assert.deepEqual(businessMonthRange("2026-04"), {
    start: "2026-04-01",
    end: "2026-04-30",
  });
  assert.deepEqual(businessMonthRange("2026-07"), {
    start: "2026-07-01",
    end: "2026-07-31",
  });
});

test("rejects malformed or out-of-range calendar months", () => {
  assert.equal(isValidBusinessMonth("2026-12"), true);
  assert.equal(isValidBusinessMonth("2026-13"), false);
  assert.equal(isValidBusinessMonth("0999-12"), false);
  assert.equal(isValidBusinessMonth("2026-2"), false);
  assert.throws(() => businessMonthRange("2026-13"), /Invalid business month/);
});

test("chooses the current month using the Panama calendar", () => {
  assert.deepEqual(
    currentMonthInPanama(new Date("2024-03-01T04:30:00.000Z")),
    {
      start: "2024-02-01",
      end: "2024-02-29",
    },
  );
});

test("calculates and validates full calendar years", () => {
  assert.deepEqual(businessYearRange("2024"), {
    start: "2024-01-01",
    end: "2024-12-31",
  });
  assert.equal(isValidBusinessYear("2026"), true);
  assert.equal(isValidBusinessYear("0999"), false);
  assert.equal(isValidBusinessYear("9999"), false);
  assert.equal(isValidBusinessYear("20a6"), false);
  assert.throws(() => businessYearRange("9999"), /Invalid business year/);
});
