export interface QuotationLineInput {
  quantity: string;
  unitPrice: string;
}

export interface QuotationTotals {
  lineTotals: string[];
  subtotal: string;
  tax: string;
  total: string;
}

function parseQuantityThousandths(value: string): bigint | null {
  const match = /^(\d{1,8})(?:\.(\d{1,3}))?$/.exec(value.trim());
  if (!match) {
    return null;
  }

  const quantity =
    BigInt(match[1]) * BigInt(1000) +
    BigInt((match[2] ?? "").padEnd(3, "0"));
  return quantity > BigInt(0) ? quantity : null;
}

function parsePriceCents(value: string): bigint | null {
  const match = /^(\d{1,10})(?:\.(\d{1,2}))?$/.exec(value.trim());
  if (!match) {
    return null;
  }

  return (
    BigInt(match[1]) * BigInt(100) +
    BigInt((match[2] ?? "").padEnd(2, "0"))
  );
}

function centsToMoney(cents: bigint): string {
  return `${cents / BigInt(100)}.${String(cents % BigInt(100)).padStart(2, "0")}`;
}

export function calculateQuotationTotals(
  lines: readonly QuotationLineInput[],
): QuotationTotals | null {
  if (lines.length === 0) {
    return null;
  }

  const lineTotals: bigint[] = [];

  for (const line of lines) {
    const quantity = parseQuantityThousandths(line.quantity);
    const unitPrice = parsePriceCents(line.unitPrice);
    if (quantity === null || unitPrice === null) {
      return null;
    }

    lineTotals.push((quantity * unitPrice + BigInt(500)) / BigInt(1000));
  }

  const subtotal = lineTotals.reduce((sum, amount) => sum + amount, BigInt(0));
  const tax = (subtotal * BigInt(7) + BigInt(50)) / BigInt(100);

  return {
    lineTotals: lineTotals.map(centsToMoney),
    subtotal: centsToMoney(subtotal),
    tax: centsToMoney(tax),
    total: centsToMoney(subtotal + tax),
  };
}
