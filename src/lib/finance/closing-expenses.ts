import type { RowDataPacket } from "mysql2";
import type { PoolConnection } from "mysql2/promise";
import { writeAuditLog } from "@/lib/finance/audit";
import { moneyToCents, subtractMoney, sumMoney } from "@/lib/finance/money";

interface ClosingAmountsRow extends RowDataPacket {
  id: string | number;
  gross_cash_total: string;
  cash_total: string;
  gross_reported_sales_total: string;
  reported_sales_total: string;
}

interface DeductionRow extends RowDataPacket {
  amount: string;
}

export interface ClosingDeductionSummary {
  closingId: string;
  deductionTotal: string;
  grossCashTotal: string;
  cashTotal: string;
  grossReportedSalesTotal: string;
  reportedSalesTotal: string;
}

export class ClosingDeductionExceedsCashError extends Error {
  constructor() {
    super("Closing cash deductions exceed the recorded cash total.");
    this.name = "ClosingDeductionExceedsCashError";
  }
}

export async function refreshClosingExpenseDeduction(
  connection: PoolConnection,
  operationDate: string,
  actorUserId: string,
  audit = true,
): Promise<ClosingDeductionSummary | null> {
  const [closingRows] = await connection.execute<ClosingAmountsRow[]>(
    `SELECT id, gross_cash_total, cash_total,
            gross_reported_sales_total, reported_sales_total
     FROM daily_closings
     WHERE operation_date = ?
     FOR UPDATE`,
    [operationDate],
  );
  const closing = closingRows[0];
  if (!closing) {
    return null;
  }

  const [deductionRows] = await connection.execute<DeductionRow[]>(
    `SELECT amount
     FROM expenses
     WHERE closing_operation_date = ?
       AND deduct_from_closing = 1
       AND status = 'paid'
     FOR UPDATE`,
    [operationDate],
  );
  const deductionTotal = sumMoney(
    deductionRows.map((expense) => expense.amount),
  );
  const cashTotal = subtractMoney(closing.gross_cash_total, deductionTotal);
  const reportedSalesTotal = subtractMoney(
    closing.gross_reported_sales_total,
    deductionTotal,
  );

  if (cashTotal === null || reportedSalesTotal === null) {
    throw new ClosingDeductionExceedsCashError();
  }

  const hasChanged =
    moneyToCents(cashTotal) !== moneyToCents(closing.cash_total) ||
    moneyToCents(reportedSalesTotal) !==
      moneyToCents(closing.reported_sales_total);

  if (hasChanged) {
    await connection.execute(
      `UPDATE daily_closings
       SET cash_total = ?, reported_sales_total = ?, updated_at = UTC_TIMESTAMP(3)
       WHERE id = ?`,
      [cashTotal, reportedSalesTotal, closing.id],
    );

    if (audit) {
      await writeAuditLog(connection, {
        actorUserId,
        entityType: "daily_closing",
        entityId: String(closing.id),
        action: "expense_deduction_adjusted",
        beforeData: {
          cash_total: closing.cash_total,
          reported_sales_total: closing.reported_sales_total,
        },
        afterData: {
          cash_total: cashTotal,
          reported_sales_total: reportedSalesTotal,
          expense_deduction_total: deductionTotal,
        },
      });
    }
  }

  return {
    closingId: String(closing.id),
    deductionTotal,
    grossCashTotal: closing.gross_cash_total,
    cashTotal,
    grossReportedSalesTotal: closing.gross_reported_sales_total,
    reportedSalesTotal,
  };
}
