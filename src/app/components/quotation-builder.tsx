"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { calculateQuotationTotals } from "@/lib/finance/quotation";
import { formatMoney } from "@/lib/finance/money";

interface QuotationLine {
  id: number;
  description: string;
  quantity: string;
  unitPrice: string;
}

interface QuoteNumberResponse {
  quoteNumber: string;
  date: string;
}

interface ClientDetails {
  name: string;
  phone: string;
  email: string;
  address: string;
}

const initialClient: ClientDetails = {
  name: "",
  phone: "",
  email: "",
  address: "",
};

const initialLines: QuotationLine[] = [
  { id: 1, description: "", quantity: "1", unitPrice: "0.00" },
];

function isQuoteNumberResponse(value: unknown): value is QuoteNumberResponse {
  if (!value || typeof value !== "object") {
    return false;
  }

  const response = value as Record<string, unknown>;
  return (
    typeof response.quoteNumber === "string" &&
    typeof response.date === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(response.date)
  );
}

async function allocateQuoteNumber(): Promise<QuoteNumberResponse> {
  const response = await fetch("/api/finance/quotations/next-number", {
    method: "POST",
  });
  let payload: unknown;

  try {
    payload = await response.json();
  } catch {
    throw new Error("El servidor respondió con un formato no válido.");
  }

  if (!response.ok) {
    const message =
      payload &&
      typeof payload === "object" &&
      "error" in payload &&
      typeof payload.error === "string"
        ? payload.error
        : "No se pudo asignar el número de cotización.";
    throw new Error(message);
  }

  if (!isQuoteNumberResponse(payload)) {
    throw new Error("El servidor respondió con datos de cotización no válidos.");
  }

  return payload;
}

function formatBusinessDate(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return "—";
  }

  return new Intl.DateTimeFormat("es-PA", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T12:00:00Z`));
}

function formatEnteredPrice(value: string): string {
  return /^\d{1,10}(?:\.\d{1,2})?$/.test(value)
    ? formatMoney(value)
    : "—";
}

export function QuotationBuilder() {
  const [quoteNumber, setQuoteNumber] = useState("");
  const [quoteDate, setQuoteDate] = useState("");
  const [validUntil, setValidUntil] = useState("");
  const [client, setClient] = useState(initialClient);
  const [lines, setLines] = useState(initialLines);
  const [error, setError] = useState("");
  const [isAllocating, setIsAllocating] = useState(true);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [downloadMessage, setDownloadMessage] = useState("");
  const nextLineId = useRef(2);
  const initialNumberRequested = useRef(false);
  const totals = calculateQuotationTotals(lines);

  const startNewQuotation = useCallback(async () => {
    setIsAllocating(true);
    setError("");

    try {
      const allocation = await allocateQuoteNumber();
      setQuoteNumber(allocation.quoteNumber);
      setQuoteDate(allocation.date);
      setValidUntil("");
      setClient(initialClient);
      setLines([{ ...initialLines[0], id: nextLineId.current++ }]);
    } catch (allocationError) {
      setError(
        allocationError instanceof Error
          ? allocationError.message
          : "No se pudo asignar el número de cotización. Inténtalo nuevamente.",
      );
    } finally {
      setIsAllocating(false);
    }
  }, []);

  useEffect(() => {
    if (initialNumberRequested.current) {
      return;
    }

    initialNumberRequested.current = true;
    void startNewQuotation();
  }, [startNewQuotation]);

  function updateClient(field: keyof ClientDetails, value: string) {
    setClient((current) => ({ ...current, [field]: value }));
  }

  function updateLine(
    id: number,
    field: keyof Omit<QuotationLine, "id">,
    value: string,
  ) {
    setLines((current) =>
      current.map((line) =>
        line.id === id ? { ...line, [field]: value } : line,
      ),
    );
  }

  async function handleDownload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!quoteNumber || !quoteDate) {
      setError("Asigna un número de cotización antes de generar el PDF.");
      return;
    }
    if (!totals) {
      setError("Revisa las cantidades y precios de los conceptos.");
      return;
    }

    setError("");
    setDownloadMessage("");
    setIsGeneratingPdf(true);
    try {
      const [{ pdf }, { QuotationPdfDocument }] = await Promise.all([
        import("@react-pdf/renderer"),
        import("./quotation-pdf-document"),
      ]);
      const blob = await pdf(
        <QuotationPdfDocument
          client={client}
          lineTotals={totals.lineTotals}
          lines={lines}
          quoteDate={quoteDate}
          quoteNumber={quoteNumber}
          subtotal={totals.subtotal}
          tax={totals.tax}
          total={totals.total}
          validUntil={validUntil}
        />,
      ).toBlob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${quoteNumber}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setDownloadMessage(
        "PDF generado sin el encabezado ni la dirección del navegador. Imprime este archivo si lo necesitas en papel.",
      );
    } catch (generationError) {
      setError(
        generationError instanceof Error
          ? `No se pudo generar el PDF: ${generationError.message}`
          : "No se pudo generar el PDF. Inténtalo nuevamente.",
      );
    } finally {
      setIsGeneratingPdf(false);
    }
  }

  return (
    <div className="quotation-workspace">
      <form
        className="dashboard-card quotation-editor"
        onSubmit={handleDownload}
      >
        <div className="quotation-editor-heading">
          <div>
            <p className="eyebrow">Preparar documento</p>
            <h2>Datos de la cotización</h2>
          </div>
          <button
            className="button-secondary"
            disabled={isAllocating}
            onClick={() => void startNewQuotation()}
            type="button"
          >
            {isAllocating ? "Asignando número…" : "Nueva cotización"}
          </button>
        </div>

        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}
        <p className="quotation-number-status" role="status">
          {isAllocating
            ? "Asignando número consecutivo…"
            : quoteNumber
              ? `Número asignado: ${quoteNumber}`
              : "Todavía no se ha asignado un número."}
        </p>

        <fieldset className="quotation-fieldset">
          <legend>Cliente</legend>
          <div className="form-grid">
            <label>
              Nombre del cliente o empresa
              <input
                autoComplete="name"
                maxLength={190}
                onChange={(event) => updateClient("name", event.target.value)}
                required
                value={client.name}
              />
            </label>
            <label>
              Teléfono del cliente
              <input
                autoComplete="tel"
                maxLength={40}
                onChange={(event) => updateClient("phone", event.target.value)}
                required
                type="tel"
                value={client.phone}
              />
            </label>
            <label>
              Correo del cliente
              <input
                autoComplete="email"
                maxLength={190}
                onChange={(event) => updateClient("email", event.target.value)}
                required
                type="email"
                value={client.email}
              />
            </label>
            <label>
              Dirección del cliente (opcional)
              <input
                autoComplete="street-address"
                maxLength={300}
                onChange={(event) => updateClient("address", event.target.value)}
                value={client.address}
              />
            </label>
            <label>
              Cotización válida hasta
              <input
                min={quoteDate}
                onChange={(event) => setValidUntil(event.target.value)}
                required
                type="date"
                value={validUntil}
              />
            </label>
          </div>
        </fieldset>

        <fieldset className="quotation-fieldset quotation-lines-fieldset">
          <legend>Conceptos</legend>
          <p className="form-hint">
            El importe se calcula por cantidad y precio unitario. ITBMS del 7%
            aplicado al subtotal.
          </p>
          <div className="quotation-line-list">
            {lines.map((line, index) => (
              <div className="quotation-line-editor" key={line.id}>
                <label className="quotation-description-field">
                  Concepto {index + 1}
                  <input
                    maxLength={240}
                    onChange={(event) =>
                      updateLine(line.id, "description", event.target.value)
                    }
                    placeholder="Descripción del producto o servicio"
                    required
                    value={line.description}
                  />
                </label>
                <label>
                  Cantidad
                  <input
                    min="0.001"
                    onChange={(event) =>
                      updateLine(line.id, "quantity", event.target.value)
                    }
                    required
                    step="0.001"
                    type="number"
                    value={line.quantity}
                  />
                </label>
                <label>
                  Precio unitario (B/.)
                  <input
                    min="0"
                    onChange={(event) =>
                      updateLine(line.id, "unitPrice", event.target.value)
                    }
                    required
                    step="0.01"
                    type="number"
                    value={line.unitPrice}
                  />
                </label>
                <div className="quotation-line-remove">
                  <span>Importe</span>
                  <strong>
                    {totals
                      ? formatMoney(totals.lineTotals[index])
                      : "—"}
                  </strong>
                  <button
                    aria-label={`Eliminar concepto ${index + 1}`}
                    className="button-secondary quotation-remove-button"
                    disabled={lines.length === 1}
                    onClick={() =>
                      setLines((current) =>
                        current.filter((item) => item.id !== line.id),
                      )
                    }
                    type="button"
                  >
                    Quitar
                  </button>
                </div>
              </div>
            ))}
          </div>
          <button
            className="button-secondary quotation-add-button"
            onClick={() =>
              setLines((current) => [
                ...current,
                {
                  id: nextLineId.current++,
                  description: "",
                  quantity: "1",
                  unitPrice: "0.00",
                },
              ])
            }
            type="button"
          >
            Agregar concepto
          </button>
        </fieldset>

        <div className="quotation-form-actions">
          <p>La información de esta cotización no se guarda en el CRM.</p>
          <button
            disabled={isAllocating || isGeneratingPdf || !quoteNumber}
            type="submit"
          >
            {isGeneratingPdf ? "Generando PDF…" : "Descargar PDF limpio"}
          </button>
        </div>
        {downloadMessage ? (
          <p className="success-message" role="status">
            {downloadMessage}
          </p>
        ) : null}
      </form>

      <section aria-label="Vista previa de la cotización" className="quotation-paper">
        <header className="quotation-document-header">
          <div className="quotation-company">
            <p className="quotation-brand">AZUMI</p>
            <h2>RESTAURANTE AZUMI BISTRO INC</h2>
            <p>RUC: 155744922-2-2023 DV99</p>
            <p>San Francisco, calle 72, frente al Instituto Italiano Enrico Fermi, locales 2 y 3.</p>
            <p>
              diana@azumipty.com <span aria-hidden="true">·</span> +507 6045-4821
            </p>
          </div>
          <div className="quotation-document-number">
            <p>COTIZACIÓN</p>
            <strong>{quoteNumber || "Asignando…"}</strong>
          </div>
        </header>

        <div className="quotation-document-meta">
          <p>
            <span>Fecha</span>
            <strong>{formatBusinessDate(quoteDate)}</strong>
          </p>
          <p>
            <span>Válida hasta</span>
            <strong>{formatBusinessDate(validUntil)}</strong>
          </p>
        </div>

        <section className="quotation-client-block">
          <p className="quotation-block-label">COTIZADA PARA</p>
          <h3>{client.name || "Nombre del cliente o empresa"}</h3>
          <div className="quotation-client-contact">
            <span>{client.phone || "Teléfono del cliente"}</span>
            <span>{client.email || "Correo del cliente"}</span>
            {client.address ? <span>{client.address}</span> : null}
          </div>
        </section>

        <table className="quotation-items-table">
          <thead>
            <tr>
              <th scope="col">Descripción</th>
              <th scope="col">Cant.</th>
              <th scope="col">Precio unitario</th>
              <th scope="col">Importe</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line, index) => (
              <tr key={line.id}>
                <td>{line.description || `Concepto ${index + 1}`}</td>
                <td>{line.quantity || "—"}</td>
                <td>{formatEnteredPrice(line.unitPrice)}</td>
                <td>
                  {totals ? formatMoney(totals.lineTotals[index]) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="quotation-summary">
          <p>
            <span>Subtotal</span>
            <strong>{totals ? formatMoney(totals.subtotal) : "—"}</strong>
          </p>
          <p>
            <span>ITBMS (7%)</span>
            <strong>{totals ? formatMoney(totals.tax) : "—"}</strong>
          </p>
          <p className="quotation-grand-total">
            <span>Total</span>
            <strong>{totals ? formatMoney(totals.total) : "—"}</strong>
          </p>
        </div>

        <footer className="quotation-document-footer">
          <p>
            Gracias por considerar a Restaurante Azumi Bistro Inc. Esta
            cotización es válida hasta la fecha indicada.
          </p>
        </footer>
      </section>
    </div>
  );
}
