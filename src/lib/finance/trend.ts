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
  expenseDeducted: string;
  expenseNotDeducted: string;
}

export interface FinanceTrendExpenseAmount {
  bucket: string;
  deducted: string;
  notDeducted: string;
}

interface FinanceTrendSources {
  sales: readonly FinanceTrendAmount[];
  expenseTreatment: readonly FinanceTrendExpenseAmount[];
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
  const expenses = new Map(
    sources.expenseTreatment.map((expense) => [
      expense.bucket,
      {
        deducted: expense.deducted,
        notDeducted: expense.notDeducted,
      },
    ]),
  );

  return bucketsForRange(range, granularity).map((bucket) => {
    const expense = expenses.get(bucket);
    return {
      bucket,
      label: formatBucketLabel(bucket, granularity),
      salesTotal: sales.get(bucket) ?? "0.00",
      expenseDeducted: expense?.deducted ?? "0.00",
      expenseNotDeducted: expense?.notDeducted ?? "0.00",
    };
  });
}
