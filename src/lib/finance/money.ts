export const paymentMethods = ["cash", "card", "transfer", "other"] as const;

export const paymentMethodLabels: Record<(typeof paymentMethods)[number], string> = {
  cash: "Efectivo",
  card: "Tarjeta",
  transfer: "Transferencia",
  other: "Otro",
};

export const expensePaymentMethods = ["cash", "card", "yappy"] as const;

export const expensePaymentMethodLabels: Record<
  (typeof expensePaymentMethods)[number],
  string
> = {
  cash: "Efectivo",
  card: "Tarjeta",
  yappy: "Yappy",
};

export const closingAdjustmentTypes = [
  "discounts",
  "refunds",
  "taxes",
  "tips",
] as const;

export const adjustmentLabels: Record<
  (typeof closingAdjustmentTypes)[number],
  string
> = {
  discounts: "Descuentos",
  refunds: "Reembolsos",
  taxes: "Impuestos",
  tips: "Propinas",
};

export function normalizeMoney(value: string): string {
  const [whole, fraction = ""] = value.trim().split(".");
  return `${whole}.${fraction.padEnd(2, "0")}`;
}

export function moneyToCents(value: string | number): bigint {
  const normalized = String(value).trim();
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(normalized);

  if (!match) {
    throw new Error("Invalid decimal amount.");
  }

  return BigInt(match[1]) * BigInt(100) + BigInt((match[2] ?? "").padEnd(2, "0"));
}

function centsToMoney(cents: bigint): string {
  return `${cents / BigInt(100)}.${String(cents % BigInt(100)).padStart(2, "0")}`;
}

export function sumMoney(values: readonly (string | number)[]): string {
  return centsToMoney(
    values.reduce((total, value) => total + moneyToCents(value), BigInt(0)),
  );
}

export function subtractMoney(
  amount: string | number,
  deduction: string | number,
): string | null {
  const cents = moneyToCents(amount) - moneyToCents(deduction);
  if (cents < BigInt(0)) {
    return null;
  }

  return centsToMoney(cents);
}

export function formatMoney(value: string | number | null | undefined): string {
  const raw = String(value ?? "0").trim();
  const negative = raw.startsWith("-");
  const normalized = normalizeMoney(negative ? raw.slice(1) : raw);
  const [whole, fraction] = normalized.split(".");
  const groupedWhole = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${negative ? "-" : ""}${groupedWhole}.${fraction}`;
}
