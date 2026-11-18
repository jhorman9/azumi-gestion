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
    reportedSalesTotal: initial.reported_sales_total,
    pedidosYaTotal: initial.pedidos_ya_total,
    channelPayments: initial.channelPayments,
    cashOutflows: initial.cashOutflows,
    tips: initial.tips,
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
        reportedSalesTotal: values.reported_sales_total,
        pedidosYaTotal: values.pedidos_ya_total,
        channelPayments: values.channel_payments,
        cashOutflows: values.cash_outflows,
        tips: values.tips,
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
          Total Reporte Z
          <input
            defaultValue={initial.reported_sales_total}
            min="0"
            name="reported_sales_total"
            required
            step="0.01"
            type="number"
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
        <div className="table-scroll">
          <table className="closing-entry-table">
            <thead>
              <tr>
                <th scope="col">#</th>
                <th scope="col">Persona</th>
                <th scope="col">Importe</th>
              </tr>
            </thead>
            <tbody>
              {initial.tips.map((tip, index) => (
                <tr key={index}>
                  <th scope="row">{index + 1}</th>
                  <td>
                    <input
                      aria-label={`Persona para propina ${index + 1}`}
                      defaultValue={tip.recipient ?? ""}
                      maxLength={120}
                      name={`tip_${index + 1}_recipient`}
                    />
                  </td>
                  <td>
                    <input
                      aria-label={`Importe de propina ${index + 1}`}
                      defaultValue={tip.amount}
                      min="0"
                      name={`tip_${index + 1}_amount`}
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

      <section aria-label="Totales calculados" className="closing-totals">
        <article>
          <h3>Total Ventas</h3>
          <p>{totals ? formatMoney(totals.salesTotal) : "—"}</p>
          <span>Reporte Z + Pedidos Ya</span>
        </article>
        <article>
          <h3>Total Banco</h3>
          <p>{totals ? formatMoney(totals.bankTotal) : "—"}</p>
          <span>Suma de las 10 celdas del desglose</span>
        </article>
        <article>
          <h3>Total Dinero</h3>
          <p>{totals ? formatMoney(totals.cashTotal) : "—"}</p>
          <span>Reporte Z + Pedidos Ya − salidas de caja</span>
        </article>
        <article>
          <h3>Total Propinas</h3>
          <p>{totals ? formatMoney(totals.tipsTotal) : "—"}</p>
          <span>Suma de los importes individuales</span>
        </article>
      </section>

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
