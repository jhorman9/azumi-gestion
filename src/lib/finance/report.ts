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
  type FinanceTrendExpenseAmount,
  type FinanceTrendGranularity,
  type FinanceTrendPoint,
} from "@/lib/finance/trend";
import { subtractMoneyAllowNegative } from "@/lib/finance/money";

export interface FinanceSummary {
  salesTotal: string;
  salesAfterUnassignedExpenses: string;
  expenseIncurred: string;
  expenseIncurredDeducted: string;
  expenseIncurredNotDeducted: string;
  closingExpenseDeductions: string;
  expensePaid: string;
  supplierBillsIssued: string;
  supplierPayments: string;
  outstandingPayables: string;
  overduePayables: string;
}

interface AmountRow extends RowDataPacket {
  amount: string;
  overdue_amount?: string;
  deducted_amount?: string;
  not_deducted_amount?: string;
}

interface TrendRow extends RowDataPacket, FinanceTrendAmount {}

interface TrendExpenseRow extends RowDataPacket, FinanceTrendExpenseAmount {}

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
    pool.execute<TrendExpenseRow[]>(
      `SELECT DATE_FORMAT(incurred_on, ?) AS bucket,
              COALESCE(SUM(CASE WHEN deduct_from_closing = 1 THEN amount ELSE 0.00 END), 0.00) AS deducted,
              COALESCE(SUM(CASE WHEN deduct_from_closing = 0 THEN amount ELSE 0.00 END), 0.00) AS not_deducted
       FROM expenses
       WHERE status = 'paid'
         AND incurred_on BETWEEN ? AND ?
       GROUP BY bucket`,
      [bucketFormat, range.start, range.end],
    ),
  ]);

  return buildFinanceTrend(range, granularity, {
    sales: salesRows,
    expenseTreatment: expenseRows,
  });
}

export async function getFinanceSummary(
  pool: Pool,
  range: DateRange,
): Promise<FinanceSummary> {
  const { startUtc, endUtcExclusive } = businessRangeUtc(range.start, range.end);
  const today = todayInPanama();
  const [
    [salesRows],
    [incurredRows],
    [closingDeductionRows],
    [expensePaymentRows],
    [billRows],
    [billPaymentRows],
    [payableRows],
  ] = await Promise.all([
    pool.execute<AmountRow[]>(
      `SELECT COALESCE(SUM(reported_sales_total), 0.00) AS amount
       FROM daily_closings
       WHERE status IN ('confirmed', 'corrected')
         AND operation_date BETWEEN ? AND ?`,
      [range.start, range.end],
    ),
    pool.execute<AmountRow[]>(
      `SELECT COALESCE(SUM(amount), 0.00) AS amount,
              COALESCE(SUM(CASE WHEN deduct_from_closing = 1 THEN amount ELSE 0.00 END), 0.00) AS deducted_amount,
              COALESCE(SUM(CASE WHEN deduct_from_closing = 0 THEN amount ELSE 0.00 END), 0.00) AS not_deducted_amount
       FROM expenses
       WHERE status = 'paid'
         AND incurred_on BETWEEN ? AND ?`,
      [range.start, range.end],
    ),
    pool.execute<AmountRow[]>(
      `SELECT COALESCE(SUM(e.amount), 0.00) AS amount
       FROM expenses e
       INNER JOIN daily_closings c
         ON c.operation_date = e.closing_operation_date
       WHERE e.status = 'paid'
         AND e.deduct_from_closing = 1
         AND c.status IN ('confirmed', 'corrected')
         AND c.operation_date BETWEEN ? AND ?`,
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
    pool.execute<AmountRow[]>(
      `SELECT
         COALESCE(SUM(b.amount - COALESCE(p.paid_total, 0.00)), 0.00) AS amount,
         COALESCE(SUM(
           CASE
             WHEN b.due_date IS NOT NULL AND b.due_date < ?
             THEN b.amount - COALESCE(p.paid_total, 0.00)
             ELSE 0.00
           END
         ), 0.00) AS overdue_amount
       FROM purchase_bills b
       LEFT JOIN (
         SELECT purchase_bill_id, SUM(amount) AS paid_total
         FROM bill_payments
         GROUP BY purchase_bill_id
       ) p ON p.purchase_bill_id = b.id
       WHERE b.status = 'open'
         AND b.amount > COALESCE(p.paid_total, 0.00)`,
      [today],
    ),
  ]);

  const salesTotal = salesRows[0]?.amount ?? "0.00";
  const expensesWithoutClosing = incurredRows[0]?.not_deducted_amount ?? "0.00";

  return {
    salesTotal,
    salesAfterUnassignedExpenses: subtractMoneyAllowNegative(
      salesTotal,
      expensesWithoutClosing,
    ),
    expenseIncurred: incurredRows[0]?.amount ?? "0.00",
    expenseIncurredDeducted:
      incurredRows[0]?.deducted_amount ?? "0.00",
    expenseIncurredNotDeducted:
      incurredRows[0]?.not_deducted_amount ?? "0.00",
    closingExpenseDeductions: closingDeductionRows[0]?.amount ?? "0.00",
    expensePaid: expensePaymentRows[0]?.amount ?? "0.00",
    supplierBillsIssued: billRows[0]?.amount ?? "0.00",
    supplierPayments: billPaymentRows[0]?.amount ?? "0.00",
    outstandingPayables: payableRows[0]?.amount ?? "0.00",
    overduePayables: payableRows[0]?.overdue_amount ?? "0.00",
  };
}
