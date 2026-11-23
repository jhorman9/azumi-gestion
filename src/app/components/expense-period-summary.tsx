import Link from "next/link";
import { formatMoney } from "@/lib/finance/money";

interface ExpensePeriodSummaryProps {
  salesTotal: string;
  expenseIncurred: string;
  salesAfterExpenses: string;
}

export function ExpensePeriodSummary({
  salesTotal,
  expenseIncurred,
  salesAfterExpenses,
}: ExpensePeriodSummaryProps) {
  const isLoss = salesAfterExpenses.startsWith("-");

  return (
    <section
      aria-labelledby="expense-period-summary-heading"
      className="dashboard-card expense-period-summary"
    >
      <div className="section-heading">
        <div>
          <p className="eyebrow">Saldo del período</p>
          <h2 id="expense-period-summary-heading">Reporte Z menos gastos</h2>
        </div>
        <Link className="button-secondary text-link" href="/dashboard/expenses">
          Ver gastos
        </Link>
      </div>
      <p className="expense-treatment-equation">
        <span>Reporte Z neto de cierres: {formatMoney(salesTotal)}</span>
        <span aria-hidden="true">−</span>
        <span>Gastos pagados del período: {formatMoney(expenseIncurred)}</span>
        <span aria-hidden="true">=</span>
        <strong>{formatMoney(salesAfterExpenses)}</strong>
      </p>
      <div className="expense-period-summary-result">
        <span>Saldo después de restar todos los gastos</span>
        <strong className={isLoss ? "is-loss" : undefined}>
          {formatMoney(salesAfterExpenses)}
        </strong>
        <p>
          Los gastos se registran por fecha del gasto y no reducen ningún cierre
          diario. Si el resultado es negativo, refleja una pérdida del período.
        </p>
      </div>
    </section>
  );
}
