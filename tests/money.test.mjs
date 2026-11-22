import assert from "node:assert/strict";
import test from "node:test";
import { subtractMoneyAllowNegative } from "../src/lib/finance/money.ts";

test("subtracts expenses and preserves a negative period balance", () => {
  assert.equal(subtractMoneyAllowNegative("100.00", "125.75"), "-25.75");
  assert.equal(subtractMoneyAllowNegative("125.75", "100.00"), "25.75");
  assert.equal(subtractMoneyAllowNegative("100.00", "100.00"), "0.00");
});
