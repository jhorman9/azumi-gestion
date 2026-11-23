import type { RowDataPacket } from "mysql2";
import type { Pool } from "mysql2/promise";
import {
  businessRangeUtc,
  todayInPanama,
  type DateRange,
} from "@/lib/finance/dates";
import {
  buildFinanceTrend,
  type FinanceTrendAmount,
  type FinanceTrendGranularity,
  type FinanceTrendPoint,
} from "@/lib/finance/trend";
import { subtractMoneyAllowNegative } from "@/lib/finance/money";

export interface FinanceSummary {
  salesTotal: string;
  salesAfterExpenses: string;
  expenseIncurred: string;
  expensePaid: string;
  supplierBillsIssued: string;
  supplierPayments: string;
  outstandingPayables: string;
  overduePayables: string;
}

export interface PayablesSummary {
  totalAmount: string;
  totalCount: number;
  overdueAmount: string;
  overdueCount: number;
}

interface AmountRow extends RowDataPacket {
  amount: string;
}

interface PayablesRow extends RowDataPacket {
  amount: string;
  overdue_amount: string;
  total_count: number | string;
  overdue_count: number | string;
}

interface TrendRow extends RowDataPacket, FinanceTrendAmount {}

export async function getPayablesSummary(pool: Pool): Promise<PayablesSummary> {
  const today = todayInPanama();
  const [rows] = await pool.execute<PayablesRow[]>(
    `SELECT
       COUNT(*) AS total_count,
       COALESCE(SUM(b.amount - COALESCE(p.paid_total, 0.00)), 0.00) AS amount,
       COALESCE(SUM(
         CASE
           WHEN b.due_date IS NOT NULL AND b.due_date < ?
           THEN b.amount - COALESCE(p.paid_total, 0.00)
           ELSE 0.00
         END
       ), 0.00) AS overdue_amount,
       COALESCE(SUM(
         CASE
           WHEN b.due_date IS NOT NULL AND b.due_date < ? THEN 1
           ELSE 0
         END
       ), 0) AS overdue_count
     FROM purchase_bills b
     LEFT JOIN (
       SELECT purchase_bill_id, SUM(amount) AS paid_total
       FROM bill_payments
       GROUP BY purchase_bill_id
     ) p ON p.purchase_bill_id = b.id
     WHERE b.status = 'open'
       AND b.amount > COALESCE(p.paid_total, 0.00)`,
    [today, today],
  );
  const row = rows[0];

  return {
    totalAmount: row?.amount ?? "0.00",
    totalCount: Number(row?.total_count ?? 0),
    overdueAmount: row?.overdue_amount ?? "0.00",
    overdueCount: Number(row?.overdue_count ?? 0),
  };
}

export async function getFinanceTrend(
  pool: Pool,
  range: DateRange,
  granularity: FinanceTrendGranularity,
): Promise<FinanceTrendPoint[]> {
  const bucketFormat =
    granularity === "day" ? "%Y-%m-%d" : "%Y-%m";
  const [[salesRows], [expenseRows]] = await Promise.all([
    pool.execute<TrendRow[]>(
      `SELECT DATE_FORMAT(operation_date, ?) AS bucket,
              COALESCE(SUM(reported_sales_total), 0.00) AS amount
       FROM daily_closings
       WHERE status IN ('confirmed', 'corrected')
         AND operation_date BETWEEN ? AND ?
       GROUP BY bucket`,
      [bucketFormat, range.start, range.end],
    ),
    pool.execute<TrendRow[]>(
      `SELECT DATE_FORMAT(incurred_on, ?) AS bucket,
              COALESCE(SUM(amount), 0.00) AS amount
       FROM expenses
       WHERE status = 'paid'
         AND incurred_on BETWEEN ? AND ?
       GROUP BY bucket`,
      [bucketFormat, range.start, range.end],
    ),
  ]);

  return buildFinanceTrend(range, granularity, {
    sales: salesRows,
    expensesIncurred: expenseRows,
  });
}

export async function getFinanceSummary(
  pool: Pool,
  range: DateRange,
): Promise<FinanceSummary> {
  const { startUtc, endUtcExclusive } = businessRangeUtc(range.start, range.end);
  const [
    [salesRows],
    [incurredRows],
    [expensePaymentRows],
    [billRows],
    [billPaymentRows],
    payablesSummary,
  ] = await Promise.all([
    pool.execute<AmountRow[]>(
      `SELECT COALESCE(SUM(reported_sales_total), 0.00) AS amount
       FROM daily_closings
       WHERE status IN ('confirmed', 'corrected')
         AND operation_date BETWEEN ? AND ?`,
      [range.start, range.end],
    ),
    pool.execute<AmountRow[]>(
      `SELECT COALESCE(SUM(amount), 0.00) AS amount
       FROM expenses
       WHERE status = 'paid'
         AND incurred_on BETWEEN ? AND ?`,
      [range.start, range.end],
    ),
    pool.execute<AmountRow[]>(
      `SELECT COALESCE(SUM(amount), 0.00) AS amount
       FROM expenses
       WHERE status = 'paid'
         AND paid_at >= ? AND paid_at < ?`,
      [startUtc, endUtcExclusive],
    ),
    pool.execute<AmountRow[]>(
      `SELECT COALESCE(SUM(amount), 0.00) AS amount
       FROM purchase_bills
       WHERE status = 'open'
         AND issue_date BETWEEN ? AND ?`,
      [range.start, range.end],
    ),
    pool.execute<AmountRow[]>(
      `SELECT COALESCE(SUM(amount), 0.00) AS amount
       FROM bill_payments
       WHERE paid_at >= ? AND paid_at < ?`,
      [startUtc, endUtcExclusive],
    ),
    getPayablesSummary(pool),
  ]);

  const salesTotal = salesRows[0]?.amount ?? "0.00";
  const expenseIncurred = incurredRows[0]?.amount ?? "0.00";

  return {
    salesTotal,
    salesAfterExpenses: subtractMoneyAllowNegative(salesTotal, expenseIncurred),
    expenseIncurred,
    expensePaid: expensePaymentRows[0]?.amount ?? "0.00",
    supplierBillsIssued: billRows[0]?.amount ?? "0.00",
    supplierPayments: billPaymentRows[0]?.amount ?? "0.00",
    outstandingPayables: payablesSummary.totalAmount,
    overduePayables: payablesSummary.overdueAmount,
  };
}
