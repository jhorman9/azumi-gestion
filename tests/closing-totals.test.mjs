import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateClosingTotals,
  closingPaymentChannels,
  closingPaymentTypes,
} from "../src/lib/finance/closing.ts";

function paymentRows(amount = "0.00") {
  return closingPaymentTypes.flatMap((paymentType) =>
    closingPaymentChannels.map((paymentChannel) => ({
      payment_type: paymentType,
      payment_channel: paymentChannel,
      amount,
    })),
  );
}

test("subtracts cash outflows and keeps the daily tip separate from Report Z", () => {
  const totals = calculateClosingTotals({
    cashTotal: "1000.00",
    pedidosYaTotal: "50.00",
    channelPayments: paymentRows("10.00"),
    cashOutflows: [{ amount: "100.00" }, { amount: "50.00" }],
    tipsTotal: "30.00",
  });

  assert.deepEqual(totals, {
    reportedSalesTotal: "1000.00",
    bankTotal: "100.00",
    cashTotal: "850.00",
    cashOutflowTotal: "150.00",
    tipsTotal: "30.00",
    grossCashTotal: "1000.00",
    grossReportedSalesTotal: "1150.00",
  });
});

test("rejects cash outflows greater than the cash counted", () => {
  const totals = calculateClosingTotals({
    cashTotal: "25.00",
    pedidosYaTotal: "0.00",
    channelPayments: paymentRows(),
    cashOutflows: [{ amount: "200.00" }],
    tipsTotal: "10.00",
  });

  assert.equal(totals, null);
});

test("changing tips does not change Report Z", () => {
  const input = {
    cashTotal: "100.00",
    pedidosYaTotal: "20.00",
    channelPayments: paymentRows(),
    cashOutflows: [],
  };
  const withoutTips = calculateClosingTotals({ ...input, tipsTotal: "0.00" });
  const withTips = calculateClosingTotals({ ...input, tipsTotal: "45.50" });

  assert.equal(withoutTips?.reportedSalesTotal, withTips?.reportedSalesTotal);
  assert.equal(withTips?.tipsTotal, "45.50");
});
