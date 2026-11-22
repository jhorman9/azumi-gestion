export const closingPaymentTypes = ["credit_card", "clave"] as const;
export type ClosingPaymentType = (typeof closingPaymentTypes)[number];

export const closingPaymentTypeLabels: Record<ClosingPaymentType, string> = {
  credit_card: "Tarjeta de crédito",
  clave: "Clave",
};

export const closingPaymentChannels = [
  "pos",
  "bac",
  "banesco",
  "yappy",
  "ach",
] as const;
export type ClosingPaymentChannel = (typeof closingPaymentChannels)[number];

export const closingPaymentChannelLabels: Record<
  ClosingPaymentChannel,
  string
> = {
  pos: "Punto de Venta",
  bac: "BAC",
  banesco: "Banesco",
  yappy: "Yappy",
  ach: "ACH",
};

export const cashOutflowSlots = 6;
export const tipSlots = 5;

export interface ClosingPayment {
  payment_type: ClosingPaymentType;
  payment_channel: ClosingPaymentChannel;
  amount: string;
}

export interface CashOutflow {
  description: string | null;
  amount: string;
}

export interface ClosingTip {
  recipient: string | null;
  amount: string;
}

export interface ClosingFormDefaults {
  operation_date: string;
  reported_sales_total: string;
  pedidos_ya_total: string;
  cash_total: string;
  channelPayments: ClosingPayment[];
  cashOutflows: CashOutflow[];
  tips: ClosingTip[];
  notes: string;
}

export interface ClosingTotalsInput {
  pedidosYaTotal: string;
  cashTotal: string;
  channelPayments: readonly Pick<ClosingPayment, "amount">[];
  tips: readonly Pick<ClosingTip, "amount">[];
}

export interface ClosingTotals {
  reportedSalesTotal: string;
  bankTotal: string;
  cashTotal: string;
  tipsTotal: string;
}

export function collectClosingFormFields(fields: Record<string, string>) {
  return {
    action: fields.action ?? "",
    operation_date: fields.operation_date ?? "",
    pedidos_ya_total: fields.pedidos_ya_total ?? "",
    cash_total: fields.cash_total ?? "",
    notes: fields.notes ?? "",
    correction_reason: fields.correction_reason ?? "",
    channel_payments: closingPaymentTypes.flatMap((paymentType) =>
      closingPaymentChannels.map((paymentChannel) => ({
        payment_type: paymentType,
        payment_channel: paymentChannel,
        amount:
          fields[`payment_${paymentType}_${paymentChannel}`] ?? "",
      })),
    ),
    cash_outflows: Array.from({ length: cashOutflowSlots }, (_, index) => ({
      description: fields[`cash_outflow_${index + 1}_description`] ?? "",
      amount: fields[`cash_outflow_${index + 1}_amount`] ?? "",
    })),
    tips: Array.from({ length: tipSlots }, (_, index) => ({
      recipient: fields[`tip_${index + 1}_recipient`] ?? "",
      amount: fields[`tip_${index + 1}_amount`] ?? "",
    })),
  };
}

function parseCents(value: string): bigint | null {
  const match = /^(\d{1,10})(?:\.(\d{1,2}))?$/.exec(value.trim());

  if (!match) {
    return null;
  }

  return (
    BigInt(match[1]) * BigInt(100) +
    BigInt((match[2] ?? "").padEnd(2, "0"))
  );
}

function centsToMoney(value: bigint): string {
  const sign = value < BigInt(0) ? "-" : "";
  const absolute = value < BigInt(0) ? -value : value;
  return `${sign}${absolute / BigInt(100)}.${String(absolute % BigInt(100)).padStart(2, "0")}`;
}

export function calculateClosingTotals(
  input: ClosingTotalsInput,
): ClosingTotals | null {
  const pedidosYa = parseCents(input.pedidosYaTotal);
  const cash = parseCents(input.cashTotal);
  const channelAmounts = input.channelPayments.map((payment) =>
    parseCents(payment.amount),
  );
  const tipAmounts = input.tips.map((tip) => parseCents(tip.amount));

  if (
    pedidosYa === null ||
    cash === null ||
    channelAmounts.some((amount) => amount === null) ||
    tipAmounts.some((amount) => amount === null)
  ) {
    return null;
  }

  const validChannelAmounts = channelAmounts.filter(
    (amount): amount is bigint => amount !== null,
  );
  const validTipAmounts = tipAmounts.filter(
    (amount): amount is bigint => amount !== null,
  );
  const bankTotal = validChannelAmounts.reduce(
    (total, amount) => total + amount,
    BigInt(0),
  );
  const tipsTotal = validTipAmounts.reduce(
    (total, amount) => total + amount,
    BigInt(0),
  );
  const reportedSales = cash + bankTotal + pedidosYa;

  return {
    reportedSalesTotal: centsToMoney(reportedSales),
    bankTotal: centsToMoney(bankTotal),
    cashTotal: centsToMoney(cash),
    tipsTotal: centsToMoney(tipsTotal),
  };
}

export function emptyClosingFormDefaults(
  operationDate: string,
): ClosingFormDefaults {
  return {
    operation_date: operationDate,
    reported_sales_total: "0.00",
    pedidos_ya_total: "0.00",
    cash_total: "0.00",
    channelPayments: closingPaymentTypes.flatMap((paymentType) =>
      closingPaymentChannels.map((paymentChannel) => ({
        payment_type: paymentType,
        payment_channel: paymentChannel,
        amount: "0.00",
      })),
    ),
    cashOutflows: Array.from({ length: cashOutflowSlots }, () => ({
      description: "",
      amount: "0.00",
    })),
    tips: Array.from({ length: tipSlots }, () => ({
      recipient: "",
      amount: "0.00",
    })),
    notes: "",
  };
}
