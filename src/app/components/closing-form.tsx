"use client";

import {
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";
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
import { closingFormSchema } from "@/lib/validation/finance";

interface ClosingFormProps {
  actionUrl: string;
  initial: ClosingFormDefaults;
  isDraft: boolean;
  showCorrectionReason?: boolean;
}

const submissionErrorMessages: Record<string, string> = {
  invalid: "Revisa los datos del cierre.",
  duplicate: "Ya existe un cierre para esa fecha.",
  locked: "El estado del cierre cambió. Recarga la página para continuar.",
  "deduction-exceeds-cash":
    "Las salidas de caja y los gastos descontados superan el efectivo contado.",
  "outflow-exceeds-cash":
    "Las salidas de caja no pueden superar el efectivo contado.",
  "outflow-invalid":
    "Completa cada salida y verifica que su suma no supere el efectivo contado.",
  "expenses-assigned":
    "Este cierre tiene gastos asignados. Reasigna esos gastos antes de cambiar la fecha.",
  "not-found": "No se encontró el cierre.",
  failed: "No fue posible guardar los cambios.",
};

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
  const [submitError, setSubmitError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const errorDialogRef = useRef<HTMLDialogElement>(null);
  const focusAfterErrorRef = useRef<HTMLElement | null>(null);
  const paymentAmounts = new Map(
    initial.channelPayments.map((payment) => [
      `${payment.payment_type}_${payment.payment_channel}`,
      payment.amount,
    ]),
  );

  function updateTotals(event: ChangeEvent<HTMLFormElement>) {
    setSubmitError("");
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

  function showSubmitError(message: string, focusTarget?: HTMLElement | null) {
    setSubmitError(message);
    focusAfterErrorRef.current = focusTarget ?? null;
    if (errorDialogRef.current && !errorDialogRef.current.open) {
      errorDialogRef.current.showModal();
    }
  }

  function handleErrorDialogClose() {
    setSubmitError("");
    const focusTarget = focusAfterErrorRef.current;
    focusAfterErrorRef.current = null;
    focusTarget?.focus();
  }

  async function validateBeforeSubmit(event: FormEvent<HTMLFormElement>) {
    const form = event.currentTarget;
    if (isSubmitting) {
      event.preventDefault();
      return;
    }

    const formData = new FormData(form);
    const nativeEvent = event.nativeEvent;
    if (
      nativeEvent instanceof SubmitEvent &&
      nativeEvent.submitter instanceof HTMLButtonElement &&
      nativeEvent.submitter.name
    ) {
      formData.set(nativeEvent.submitter.name, nativeEvent.submitter.value);
    } else if (!formData.has("action")) {
      formData.set("action", isDraft ? "save" : "correct");
    }

    const fields: Record<string, string> = {};
    formData.forEach((value, key) => {
      if (typeof value === "string") {
        fields[key] = value;
      }
    });

    const parsed = closingFormSchema.safeParse(
      collectClosingFormFields(fields),
    );
    if (parsed.success) {
      event.preventDefault();
      setSubmitError("");
      setIsSubmitting(true);
      try {
        const response = await fetch(actionUrl, {
          method: "POST",
          body: formData,
        });
        const responseUrl = new URL(response.url, window.location.href);
        const error = responseUrl.searchParams.get("error");

        if (error) {
          const dateInput =
            error === "duplicate"
              ? form.querySelector<HTMLInputElement>(
                  '[name="operation_date"]',
                )
              : null;
          showSubmitError(
            submissionErrorMessages[error] ??
              "Ocurrió un error al guardar el cierre.",
            dateInput,
          );
          return;
        }

        if (response.redirected) {
          window.location.assign(response.url);
          return;
        }

        if (response.status === 401) {
          showSubmitError(
            "Tu sesión expiró. Inicia sesión nuevamente sin cerrar esta página; tus datos siguen aquí.",
          );
        } else if (response.status === 403) {
          showSubmitError(
            "No se autorizó el guardado. Verifica que tengas permiso para registrar cierres.",
          );
        } else if (!response.ok) {
          showSubmitError(
            `El servidor no pudo guardar el cierre (HTTP ${response.status}). Tus datos siguen aquí; inténtalo otra vez.`,
          );
        } else {
          showSubmitError(
            "El servidor no confirmó el guardado. Tus datos siguen en el formulario.",
          );
        }
      } catch {
        showSubmitError(
          "No se pudo completar el envío. Tus datos siguen en el formulario; inténtalo otra vez.",
        );
      } finally {
        setIsSubmitting(false);
      }
      return;
    }

    event.preventDefault();
    const issue = parsed.error.issues[0];

    const [field, index, property] = issue.path;
    let target: HTMLElement | null = null;
    if (field === "cash_outflows") {
      if (typeof index === "number") {
        const description = form.querySelector<HTMLInputElement>(
          `[name="cash_outflow_${index + 1}_description"]`,
        );
        const amount = form.querySelector<HTMLInputElement>(
          `[name="cash_outflow_${index + 1}_amount"]`,
        );
        target =
          property === "description"
            ? description
            : property === "amount"
              ? amount
              : description?.value.trim()
                ? amount
                : description;
      } else {
        target =
          Array.from(
            form.querySelectorAll<HTMLInputElement>(
              '[name^="cash_outflow_"][name$="_amount"]',
            ),
          ).find((input) => Number(input.value) > 0) ??
          form.querySelector<HTMLInputElement>(
            '[name^="cash_outflow_"][name$="_amount"]',
          );
      }
    } else if (field === "channel_payments" && typeof index === "number") {
      const payment = closingPaymentTypes.flatMap((paymentType) =>
        closingPaymentChannels.map((paymentChannel) => ({
          paymentType,
          paymentChannel,
        })),
      )[index];
      if (payment) {
        target = form.querySelector<HTMLInputElement>(
          `[name="payment_${payment.paymentType}_${payment.paymentChannel}"]`,
        );
      }
    } else if (typeof field === "string") {
      target = form.querySelector<HTMLElement>(`[name="${field}"]`);
    }
    showSubmitError(issue.message, target);
  }

  return (
    <>
      <form
        action={actionUrl}
        method="post"
        aria-busy={isSubmitting}
        className="finance-form closing-form"
        noValidate
        onChange={updateTotals}
        onSubmit={validateBeforeSubmit}
      >
        <section className="closing-section">
          <div className="closing-section-heading">
            <span className="closing-step">1</span>
            <div>
              <h3>Datos del día</h3>
              <p>Indica la fecha de operación y los importes principales.</p>
            </div>
          </div>
          <div className="form-grid">
            <label>
              Fecha del cierre
              <input
                defaultValue={initial.operation_date}
                max="9999-12-31"
                name="operation_date"
                required
                type="date"
              />
              <small className="field-hint">
                Selecciona el día al que corresponden estos datos.
              </small>
            </label>
            <label>
              Total de Pedidos Ya
              <input
                defaultValue={initial.pedidos_ya_total}
                inputMode="decimal"
                min="0"
                name="pedidos_ya_total"
                placeholder="0.00"
                required
                step="0.01"
                type="number"
              />
              <small className="field-hint">
                Usa el total reportado para este día.
              </small>
            </label>
            <label>
              Efectivo contado (antes de salidas)
              <input
                defaultValue={initial.cash_total}
                inputMode="decimal"
                min="0"
                name="cash_total"
                placeholder="0.00"
                required
                step="0.01"
                type="number"
              />
              <small className="field-hint">
                Ingresa el efectivo físico antes de registrar las salidas.
              </small>
            </label>
          </div>
        </section>

        <fieldset className="closing-section closing-payments-section">
          <legend>
            <span className="closing-step">2</span>
            Reporte Z: desglose de pagos
          </legend>
          <p className="form-hint">
            Registra los importes por tipo de pago y canal. Este desglose se
            concilia con las ventas; no lo sumes otra vez al total.
          </p>
          <div className="closing-payment-grid">
            {closingPaymentTypes.map((paymentType) => (
              <fieldset className="closing-payment-card" key={paymentType}>
                <legend>{closingPaymentTypeLabels[paymentType]}</legend>
                <div className="closing-payment-channels">
                  {closingPaymentChannels.map((channel) => (
                    <label key={channel}>
                      {closingPaymentChannelLabels[channel]}
                      <input
                        defaultValue={
                          paymentAmounts.get(`${paymentType}_${channel}`) ??
                          "0.00"
                        }
                        inputMode="decimal"
                        min="0"
                        name={`payment_${paymentType}_${channel}`}
                        placeholder="0.00"
                        required
                        step="0.01"
                        type="number"
                      />
                    </label>
                  ))}
                </div>
              </fieldset>
            ))}
          </div>
        </fieldset>

        <fieldset className="closing-section">
          <legend>
            <span className="closing-step">3</span>
            Salidas de caja
          </legend>
          <p className="form-hint">
            Registra cada salida que se descuenta del efectivo y del Reporte Z.
            No crea un gasto de proveedor automáticamente.
          </p>
          <div className="closing-outflow-grid">
            {initial.cashOutflows.map((outflow, index) => (
              <article className="closing-outflow-card" key={index}>
                <h4>Salida {index + 1}</h4>
                <label>
                  Descripción
                  <input
                    defaultValue={outflow.description ?? ""}
                    maxLength={200}
                    name={`cash_outflow_${index + 1}_description`}
                    placeholder="Ej.: compra o retiro de caja"
                  />
                </label>
                <label>
                  Importe
                  <input
                    defaultValue={outflow.amount}
                    inputMode="decimal"
                    min="0"
                    name={`cash_outflow_${index + 1}_amount`}
                    placeholder="0.00"
                    required
                    step="0.01"
                    type="number"
                  />
                </label>
              </article>
            ))}
          </div>
        </fieldset>

        <fieldset className="closing-section closing-tips-section">
          <legend>
            <span className="closing-step">4</span>
            Propinas
          </legend>
          <p className="form-hint">
            Registra el total del día. Las propinas se informan por separado y
            no afectan el Reporte Z ni el efectivo.
          </p>
          <label>
            Propina total del día
          <input
            aria-label="Propina total del día"
            defaultValue={initial.tips_total}
            inputMode="decimal"
            min="0"
            name="tips_total"
            placeholder="0.00"
            required
            step="0.01"
            type="number"
          />
          </label>
        </fieldset>

        <section aria-label="Totales calculados" className="closing-totals">
          <div className="closing-totals-heading">
            <h3>Resumen calculado</h3>
            <p>Se actualiza mientras completas el cierre.</p>
          </div>
          <article>
            <h4>Ventas del Reporte Z</h4>
            <p>{totals ? formatMoney(totals.reportedSalesTotal) : "—"}</p>
            <span>
              Efectivo neto + banco + Pedidos Ya; antes de gastos asignados
            </span>
          </article>
          <article>
            <h4>Pagos bancarios</h4>
            <p>{totals ? formatMoney(totals.bankTotal) : "—"}</p>
            <span>Suma del desglose por canal</span>
          </article>
          <article>
            <h4>Efectivo neto</h4>
            <p>{totals ? formatMoney(totals.cashTotal) : "—"}</p>
            <span>Contado menos las salidas de caja</span>
          </article>
          <article>
            <h4>Salidas de caja</h4>
            <p>{totals ? formatMoney(totals.cashOutflowTotal) : "—"}</p>
            <span>Se descuentan del efectivo y del Reporte Z</span>
          </article>
          <article>
            <h4>Propinas</h4>
            <p>{totals ? formatMoney(totals.tipsTotal) : "—"}</p>
            <span>Informadas aparte; no afectan las ventas</span>
          </article>
        </section>
        {!totals ? (
          <p className="closing-totals-warning" role="status">
            Verifica los importes y que las salidas no superen el efectivo
            contado para poder ver el resumen.
          </p>
        ) : null}
        <label>
          Notas (opcional)
          <textarea
            defaultValue={initial.notes}
            maxLength={2000}
            name="notes"
            placeholder="Agrega una observación útil para este cierre"
            rows={3}
          />
        </label>
        {showCorrectionReason ? (
        <label>
          Motivo de la corrección
          <textarea maxLength={500} name="correction_reason" rows={2} required />
          <small className="field-hint">
            Es obligatorio y quedará registrado en la auditoría.
          </small>
        </label>
      ) : null}
      <div className="form-actions">
        {isDraft ? (
          <>
            <button
              name="action"
              type="submit"
              value="save"
              disabled={isSubmitting}
            >
              {isSubmitting ? "Guardando…" : "Guardar borrador"}
            </button>
            <button
              className="button-secondary"
              name="action"
              type="submit"
              value="confirm"
              disabled={isSubmitting}
            >
              {isSubmitting ? "Guardando…" : "Confirmar cierre"}
            </button>
          </>
        ) : (
          <button
            name="action"
            type="submit"
            value="correct"
            disabled={isSubmitting}
          >
            {isSubmitting ? "Guardando…" : "Guardar corrección"}
          </button>
        )}
        </div>
      </form>
      <dialog
        aria-describedby="closing-form-error-message"
        aria-labelledby="closing-form-error-title"
        className="form-error-dialog"
        onClose={handleErrorDialogClose}
        ref={errorDialogRef}
      >
        <div className="form-error-dialog__content">
          <span aria-hidden="true" className="form-error-dialog__icon">
            !
          </span>
          <div>
            <p className="eyebrow">No se pudo completar</p>
            <h2 id="closing-form-error-title">Revisa el cierre</h2>
            <p id="closing-form-error-message">{submitError}</p>
          </div>
        </div>
        <div className="form-error-dialog__actions">
          <button onClick={() => errorDialogRef.current?.close()} type="button">
            Entendido
          </button>
        </div>
      </dialog>
    </>
  );
}
