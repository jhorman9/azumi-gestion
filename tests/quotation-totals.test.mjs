import assert from "node:assert/strict";
import test from "node:test";
import { calculateQuotationTotals } from "../src/lib/finance/quotation.ts";

test("calculates item amounts, subtotal, 7% ITBMS, and total in cents", () => {
  assert.deepEqual(
    calculateQuotationTotals([
      { quantity: "2", unitPrice: "10.00" },
      { quantity: "0.5", unitPrice: "3.00" },
    ]),
    {
      lineTotals: ["20.00", "1.50"],
      subtotal: "21.50",
      tax: "1.51",
      total: "23.01",
    },
  );
});

test("rounds fractional quantities to cents and rejects invalid values", () => {
  assert.deepEqual(
    calculateQuotationTotals([{ quantity: "0.5", unitPrice: "0.01" }]),
    {
      lineTotals: ["0.01"],
      subtotal: "0.01",
      tax: "0.00",
      total: "0.01",
    },
  );
  assert.equal(
    calculateQuotationTotals([{ quantity: "0", unitPrice: "10.00" }]),
    null,
  );
  assert.equal(
    calculateQuotationTotals([{ quantity: "1", unitPrice: "10.999" }]),
    null,
  );
});
