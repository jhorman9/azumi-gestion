import { formatDateTimeInPanama } from "@/lib/finance/dates";

const actionLabels: Record<string, string> = {
  created: "Creado",
  confirmed: "Confirmado",
  updated: "Modificado",
  corrected: "Corregido",
  paid: "Pagado",
  recorded: "Pago registrado",
  voided: "Anulado",
  status_changed: "Estado actualizado",
  expense_deduction_adjusted: "Descuento del cierre actualizado",
  cash_outflow_deduction_adjusted: "Salida de caja descontada",
  bootstrap_admin_created: "Administrador creado",
};

export function auditActionLabel(action: string): string {
  return actionLabels[action] ?? action.replace(/_/g, " ");
}

export function AuditLabel({
  action,
  actorName,
  occurredAt,
}: {
  action: string | null;
  actorName: string | null;
  occurredAt: string | null;
}) {
  if (!action || !occurredAt) {
    return <span className="audit-label audit-label-muted">Sin cambios registrados</span>;
  }

  return (
    <span className="audit-label">
      {auditActionLabel(action)} por {actorName ?? "Usuario no disponible"} ·{" "}
      <time dateTime={occurredAt}>{formatDateTimeInPanama(occurredAt)}</time>
    </span>
  );
}
