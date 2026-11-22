"use client";

import { useState, type ChangeEvent } from "react";
import {
  calculateClosingTotals,
  collectClosingFormFields,
  closingPaymentChannelLabels,
  closingPaymentChannels,
  closingPaymentTypeLabels,
  closingPaymentTypes,
  type ClosingFormDefaults,
} from "@/lib/finance/closing";
import { formatMoney } from "@/lib/finance/money";

interface ClosingFormProps {
  actionUrl: string;
  initial: ClosingFormDefaults;
  isDraft: boolean;
  showCorrectionReason?: boolean;
}

function initialTotals(initial: ClosingFormDefaults) {
  return calculateClosingTotals({
    pedidosYaTotal: initial.pedidos_ya_total,
    cashTotal: initial.cash_total,
    channelPayments: initial.channelPayments,
    cashOutflows: initial.cashOutflows,
    tipsTotal: initial.tips_total,
  });
}

export function ClosingForm({
  actionUrl,
  initial,
  isDraft,
  showCorrectionReason = false,
}: ClosingFormProps) {
  const [totals, setTotals] = useState(() => initialTotals(initial));
  const paymentAmounts = new Map(
    initial.channelPayments.map((payment) => [
      `${payment.payment_type}_${payment.payment_channel}`,
      payment.amount,
    ]),
  );

  function updateTotals(event: ChangeEvent<HTMLFormElement>) {
    const fields: Record<string, string> = {};
    new FormData(event.currentTarget).forEach((value, key) => {
      if (typeof value === "string") {
        fields[key] = value;
      }
    });
    const values = collectClosingFormFields(fields);
    setTotals(
      calculateClosingTotals({
        pedidosYaTotal: values.pedidos_ya_total,
        cashTotal: values.cash_total,
        channelPayments: values.channel_payments,
        cashOutflows: values.cash_outflows,
        tipsTotal: values.tips_total,
      }),
    );
  }

  return (
    <form
      action={actionUrl}
      method="post"
      className="finance-form"
      onChange={updateTotals}
    >
      <div className="form-grid">
        <label>
          Fecha
          <input
            defaultValue={initial.operation_date}
            max="9999-12-31"
            name="operation_date"
            required
            type="date"
          />
        </label>
        <label>
          Pedidos Ya
          <input
            defaultValue={initial.pedidos_ya_total}
            min="0"
            name="pedidos_ya_total"
            required
            step="0.01"
            type="number"
          />
        </label>
        <label>
          Efectivo contado (antes de salidas)
          <input
            defaultValue={initial.cash_total}
            min="0"
            name="cash_total"
            required
            step="0.01"
            type="number"
          />
        </label>
      </div>

      <fieldset>
        <legend>Desglose de Reporte Z por medio de pago</legend>
        <p className="form-hint">
          Este desglose concilia el Reporte Z; no se suma nuevamente a las ventas.
        </p>
        <div className="table-scroll">
          <table className="closing-matrix">
            <thead>
              <tr>
                <th scope="col">Tipo</th>
                {closingPaymentChannels.map((channel) => (
                  <th key={channel} scope="col">
                    {closingPaymentChannelLabels[channel]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {closingPaymentTypes.map((paymentType) => (
                <tr key={paymentType}>
                  <th scope="row">{closingPaymentTypeLabels[paymentType]}</th>
                  {closingPaymentChannels.map((channel) => (
                    <td key={channel}>
                      <input
                        aria-label={`${closingPaymentTypeLabels[paymentType]} - ${closingPaymentChannelLabels[channel]}`}
                        defaultValue={
                          paymentAmounts.get(`${paymentType}_${channel}`) ??
                          "0.00"
                        }
                        min="0"
                        name={`payment_${paymentType}_${channel}`}
                        required
                        step="0.01"
                        type="number"
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </fieldset>

      <fieldset>
        <legend>Salidas de caja</legend>
        <p className="form-hint">
          Se guardan únicamente en este cierre; no crean gastos automáticamente.
        </p>
        <div className="table-scroll">
          <table className="closing-entry-table">
            <thead>
              <tr>
                <th scope="col">#</th>
                <th scope="col">Descripción</th>
                <th scope="col">Importe</th>
              </tr>
            </thead>
            <tbody>
              {initial.cashOutflows.map((outflow, index) => (
                <tr key={index}>
                  <th scope="row">{index + 1}</th>
                  <td>
                    <input
                      aria-label={`Descripción de salida ${index + 1}`}
                      defaultValue={outflow.description ?? ""}
                      maxLength={200}
                      name={`cash_outflow_${index + 1}_description`}
                    />
                  </td>
                  <td>
                    <input
                      aria-label={`Importe de salida ${index + 1}`}
                      defaultValue={outflow.amount}
                      min="0"
                      name={`cash_outflow_${index + 1}_amount`}
                      required
                      step="0.01"
                      type="number"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </fieldset>

      <fieldset>
        <legend>Propinas</legend>
        <p className="form-hint">
          Registra el total de propinas del día. Se informa por separado y no
          afecta el Reporte Z ni el efectivo.
        </p>
        <label>
          Propina total del día
          <input
            aria-label="Propina total del día"
            defaultValue={initial.tips_total}
            min="0"
            name="tips_total"
            required
            step="0.01"
            type="number"
          />
        </label>
      </fieldset>

      <section aria-label="Totales calculados" className="closing-totals">
        <article>
          <h3>Reporte Z antes de gastos asignados</h3>
          <p>{totals ? formatMoney(totals.reportedSalesTotal) : "—"}</p>
          <span>Efectivo neto + banco + Pedidos Ya; propinas excluidas</span>
        </article>
        <article>
          <h3>Total Banco</h3>
          <p>{totals ? formatMoney(totals.bankTotal) : "—"}</p>
          <span>Suma de las 10 celdas del desglose</span>
        </article>
        <article>
          <h3>Efectivo después de salidas</h3>
          <p>{totals ? formatMoney(totals.cashTotal) : "—"}</p>
          <span>Importe contado menos las salidas de caja</span>
        </article>
        <article>
          <h3>Salidas de caja</h3>
          <p>{totals ? formatMoney(totals.cashOutflowTotal) : "—"}</p>
          <span>Se restan del efectivo y del Reporte Z</span>
        </article>
        <article>
          <h3>Propina del día</h3>
          <p>{totals ? formatMoney(totals.tipsTotal) : "—"}</p>
          <span>Se lleva por separado</span>
        </article>
      </section>
      {totals === null ? (
        <p className="form-error" role="alert">
          Revisa los importes y confirma que las salidas no superen el efectivo
          contado.
        </p>
      ) : null}

      <label>
        Notas
        <textarea
          defaultValue={initial.notes}
          maxLength={2000}
          name="notes"
          rows={3}
        />
      </label>
      {showCorrectionReason ? (
        <label>
          Motivo obligatorio de la corrección
          <textarea maxLength={500} name="correction_reason" rows={2} required />
        </label>
      ) : null}
      <div className="form-actions">
        {isDraft ? (
          <>
            <button name="action" type="submit" value="save">
              Guardar borrador
            </button>
            <button
              className="button-secondary"
              name="action"
              type="submit"
              value="confirm"
            >
              Confirmar cierre
            </button>
          </>
        ) : (
          <button name="action" type="submit" value="correct">
            Guardar corrección
          </button>
        )}
      </div>
    </form>
  );
}
