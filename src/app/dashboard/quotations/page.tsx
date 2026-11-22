import { connection } from "next/server";
import { ManagerNav } from "@/app/components/manager-nav";
import { QuotationBuilder } from "@/app/components/quotation-builder";
import { requirePermission } from "@/lib/auth/roles";

export const instant = false;

export default async function QuotationsPage() {
  await connection();
  const user = await requirePermission("finance:write");

  return (
    <main className="dashboard-page quotation-page">
      <ManagerNav user={user} />
      <div className="page-content quotation-page-content">
        <div className="page-heading quotation-page-heading">
          <div>
            <p className="eyebrow">Finanzas</p>
            <h1>Cotizaciones</h1>
            <p className="page-heading-subtitle">
              Completa los datos del cliente y los conceptos, luego descarga un
              PDF listo para imprimir y sin encabezados del navegador.
            </p>
          </div>
        </div>
        <QuotationBuilder />
      </div>
    </main>
  );
}
