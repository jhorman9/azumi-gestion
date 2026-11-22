import { notFound } from "next/navigation";
import { ManagerNav } from "@/app/components/manager-nav";
import {
  closingPaymentChannelLabels,
  closingPaymentChannels,
  closingPaymentTypeLabels,
  closingPaymentTypes,
} from "@/lib/finance/closing";

export const instant = false;

export default function ClosingPreviewPage() {
  if (process.env.NODE_ENV !== "development") {
    notFound();
  }

  return (
    <main className="dashboard-page">
      <ManagerNav
        previewMode
        user={{
          id: "preview",
          name: "Equipo Azumi",
          email: "preview@azumi.local",
          role: "admin",
        }}
      />
      <div className="page-content">
        <div className="page-heading">
          <div>
            <p className="eyebrow">Vista preliminar</p>
            <h1>Cierre de caja</h1>
          </div>
          <p>Diseño inicial · Los datos no se guardan ni se calculan.</p>
        </div>

        <section className="dashboard-card">
          <h2>Datos del cierre</h2>
          <div className="finance-form">
            <div className="form-grid">
              <label>
                Fecha
                <input type="date" />
              </label>
              <label>
                Total Reporte Z
                <input min="0" placeholder="0.00" step="0.01" type="number" />
              </label>
              <label>
                Pedidos Ya
                <input min="0" placeholder="0.00" step="0.01" type="number" />
              </label>
              <label>
                Efectivo
                <input min="0" placeholder="0.00" step="0.01" type="number" />
              </label>
            </div>
          </div>
        </section>

        <section className="dashboard-card">
          <h2>Pagos con tarjeta y Clave</h2>
          <p className="form-hint">
            Desglose por tipo de pago y canal bancario.
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
                    <th scope="row">
                      {closingPaymentTypeLabels[paymentType]}
                    </th>
                    {closingPaymentChannels.map((channel) => (
                      <td key={channel}>
                        <input
                          aria-label={`${closingPaymentTypeLabels[paymentType]} - ${closingPaymentChannelLabels[channel]}`}
                          min="0"
                          placeholder="0.00"
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
        </section>

        <section className="dashboard-card">
          <h2>Salidas de caja</h2>
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
                {Array.from({ length: 6 }, (_, index) => (
                  <tr key={index}>
                    <th scope="row">{index + 1}</th>
                    <td>
                      <input aria-label={`Descripción ${index + 1}`} />
                    </td>
                    <td>
                      <input
                        aria-label={`Importe de salida ${index + 1}`}
                        min="0"
                        placeholder="0.00"
                        step="0.01"
                        type="number"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="dashboard-card">
          <h2>Propina del día</h2>
          <label>
            Total de propinas
            <input min="0" placeholder="0.00" step="0.01" type="number" />
          </label>
          <p className="form-hint">
            Se registra como un total y no se suma ni se resta del Reporte Z.
          </p>
        </section>

        <section aria-label="Totales" className="closing-totals">
          {["Total Reporte Z", "Total Banco", "Efectivo neto", "Propina del día"].map(
            (label) => (
              <article key={label}>
                <h3>{label}</h3>
                <p>—</p>
                <span>Se definirá en la siguiente etapa</span>
              </article>
            ),
          )}
        </section>

        <section className="dashboard-card">
          <h2>Información adicional</h2>
          <div className="finance-form">
            <label>
              Realizado por
              <input placeholder="Se asignará al iniciar sesión" readOnly />
            </label>
            <label>
              Notas
              <textarea maxLength={2000} rows={3} />
            </label>
            <button disabled type="button">
              Guardado deshabilitado en esta vista
            </button>
          </div>
        </section>
      </div>
    </main>
  );
}
