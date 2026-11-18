import type { RowDataPacket } from "mysql2";
import type { Pool } from "mysql2/promise";
import {
  businessRangeUtc,
  todayInPanama,
  type DateRange,
} from "@/lib/finance/dates";

export interface FinanceSummary {
  salesTotal: string;
  expenseIncurred: string;
  expensePaid: string;
  supplierBillsIssued: string;
  supplierPayments: string;
  outstandingPayables: string;
  overduePayables: string;
}

interface AmountRow extends RowDataPacket {
  amount: string;
  overdue_amount?: string;
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
    [expensePaymentRows],
    [billRows],
    [billPaymentRows],
    [payableRows],
  ] = await Promise.all([
    pool.execute<AmountRow[]>(
      `SELECT COALESCE(SUM(reported_sales_total + pedidos_ya_total), 0.00) AS amount
       FROM daily_closings
       WHERE status IN ('confirmed', 'corrected')
         AND operation_date BETWEEN ? AND ?`,
      [range.start, range.end],
    ),
    pool.execute<AmountRow[]>(
      `SELECT COALESCE(SUM(amount), 0.00) AS amount
       FROM expenses
       WHERE status IN ('unpaid', 'paid')
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

  return {
    salesTotal: salesRows[0]?.amount ?? "0.00",
    expenseIncurred: incurredRows[0]?.amount ?? "0.00",
    expensePaid: expensePaymentRows[0]?.amount ?? "0.00",
    supplierBillsIssued: billRows[0]?.amount ?? "0.00",
    supplierPayments: billPaymentRows[0]?.amount ?? "0.00",
    outstandingPayables: payableRows[0]?.amount ?? "0.00",
    overduePayables: payableRows[0]?.overdue_amount ?? "0.00",
  };
}
