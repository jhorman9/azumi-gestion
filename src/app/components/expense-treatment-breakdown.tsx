import Link from "next/link";
import { formatMoney } from "@/lib/finance/money";

interface ExpenseTreatmentBreakdownProps {
  salesTotal: string;
  salesAfterUnassignedExpenses: string;
  expenseIncurred: string;
  expenseIncurredDeducted: string;
  expenseIncurredNotDeducted: string;
  closingExpenseDeductions: string;
}

export function ExpenseTreatmentBreakdown({
  salesTotal,
  salesAfterUnassignedExpenses,
  expenseIncurred,
  expenseIncurredDeducted,
  expenseIncurredNotDeducted,
  closingExpenseDeductions,
}: ExpenseTreatmentBreakdownProps) {
  const isLoss = salesAfterUnassignedExpenses.startsWith("-");

  return (
    <section
      aria-labelledby="expense-treatment-heading"
      className="dashboard-card expense-treatment-card"
    >
      <div className="section-heading">
        <div>
          <p className="eyebrow">Balance del período</p>
          <h2 id="expense-treatment-heading">
            Gastos y saldo acumulado
          </h2>
        </div>
        <Link className="button-secondary text-link" href="/dashboard/expenses">
          Ver gastos
        </Link>
      </div>
      <p className="expense-treatment-total">
        Gastos incurridos en el período:{" "}
        <strong>{formatMoney(expenseIncurred)}</strong>
      </p>
      <p className="expense-treatment-equation">
        <span>Reporte Z neto de cierres: {formatMoney(salesTotal)}</span>
        <span aria-hidden="true">−</span>
        <span>Gastos sin descuento: {formatMoney(expenseIncurredNotDeducted)}</span>
        <span aria-hidden="true">=</span>
        <strong>{formatMoney(salesAfterUnassignedExpenses)}</strong>
      </p>
      <div className="expense-treatment-grid">
        <article className="expense-treatment-item expense-treatment-assigned">
          <h3>Con descuento asignado</h3>
          <strong>{formatMoney(expenseIncurredDeducted)}</strong>
          <p>
            Clasificados por fecha del gasto. La fecha del cierre asignado puede
            ser de otro período.
          </p>
        </article>
        <article className="expense-treatment-item expense-treatment-unassigned">
          <h3>Sin descuento de cierre</h3>
          <strong>{formatMoney(expenseIncurredNotDeducted)}</strong>
          <p>No reducen el efectivo ni el Reporte Z de un cierre.</p>
        </article>
        <article className="expense-treatment-item expense-treatment-applied">
          <h3>Descontado de cierres finalizados</h3>
          <strong>{formatMoney(closingExpenseDeductions)}</strong>
          <p>En cierres de este período; ya está en el Reporte Z neto.</p>
        </article>
        <article
          className={`expense-treatment-item expense-treatment-balance${
            isLoss ? " expense-treatment-loss" : ""
          }`}
        >
          <h3>Saldo acumulado tras gastos sin descuento</h3>
          <strong>{formatMoney(salesAfterUnassignedExpenses)}</strong>
          <p>Reporte Z neto menos gastos que no se asignaron a un cierre.</p>
        </article>
      </div>
      <p className="expense-treatment-note">
        El saldo usa esta fórmula: Reporte Z neto − gastos sin descuento de
        cierre. Puede quedar negativo; el valor negativo refleja una pérdida.
        Los gastos asignados a cierres ya están restados del Reporte Z y no se
        descuentan de nuevo.
      </p>
    </section>
  );
}
