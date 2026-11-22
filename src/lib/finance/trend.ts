export type FinanceTrendGranularity = "day" | "month";

export interface FinanceTrendRange {
  start: string;
  end: string;
}

export interface FinanceTrendAmount {
  bucket: string;
  amount: string;
}

export interface FinanceTrendPoint {
  bucket: string;
  label: string;
  salesTotal: string;
  expenseIncurred: string;
  expensePaid: string;
}

interface FinanceTrendSources {
  sales: readonly FinanceTrendAmount[];
  expensesIncurred: readonly FinanceTrendAmount[];
  expensesPaid: readonly FinanceTrendAmount[];
}

function bucketsForRange(
  range: FinanceTrendRange,
  granularity: FinanceTrendGranularity,
): string[] {
  if (granularity === "month") {
    const year = Number(range.start.slice(0, 4));
    return Array.from({ length: 12 }, (_, index) =>
      `${year}-${String(index + 1).padStart(2, "0")}`,
    );
  }

  const buckets: string[] = [];
  const date = new Date(`${range.start}T00:00:00Z`);
  const end = range.end;

  while (date.toISOString().slice(0, 10) <= end) {
    buckets.push(date.toISOString().slice(0, 10));
    date.setUTCDate(date.getUTCDate() + 1);
  }

  return buckets;
}

function amountByBucket(
  rows: readonly FinanceTrendAmount[],
): Map<string, string> {
  return new Map(rows.map(({ bucket, amount }) => [bucket, amount]));
}

function formatBucketLabel(
  bucket: string,
  granularity: FinanceTrendGranularity,
): string {
  if (granularity === "day") {
    return String(Number(bucket.slice(-2)));
  }

  const [year, month] = bucket.split("-").map(Number);
  return new Intl.DateTimeFormat("es-PA", {
    month: "short",
    timeZone: "UTC",
  })
    .format(new Date(Date.UTC(year, month - 1, 1)))
    .replace(".", "");
}

export function buildFinanceTrend(
  range: FinanceTrendRange,
  granularity: FinanceTrendGranularity,
  sources: FinanceTrendSources,
): FinanceTrendPoint[] {
  const sales = amountByBucket(sources.sales);
  const expensesIncurred = amountByBucket(sources.expensesIncurred);
  const expensesPaid = amountByBucket(sources.expensesPaid);

  return bucketsForRange(range, granularity).map((bucket) => ({
    bucket,
    label: formatBucketLabel(bucket, granularity),
    salesTotal: sales.get(bucket) ?? "0.00",
    expenseIncurred: expensesIncurred.get(bucket) ?? "0.00",
    expensePaid: expensesPaid.get(bucket) ?? "0.00",
  }));
}
