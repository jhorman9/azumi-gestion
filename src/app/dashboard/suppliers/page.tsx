import { connection } from "next/server";
import type { RowDataPacket } from "mysql2";
import { ManagerNav } from "@/app/components/manager-nav";
import { getDbPool } from "@/lib/db";
import { requirePermission } from "@/lib/auth/roles";

export const instant = false;

interface SupplierRow extends RowDataPacket {
  id: string | number;
  legal_name: string;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  is_active: number;
}

interface SuppliersPageProps {
  searchParams: Promise<{
    created?: string | string[];
    updated?: string | string[];
    error?: string | string[];
  }>;
}

function firstValue(value?: string | string[]): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function SuppliersPage({
  searchParams,
}: SuppliersPageProps) {
  await connection();
  const user = await requirePermission("finance:read");
  const [suppliers] = await getDbPool().execute<SupplierRow[]>(
    `SELECT id, legal_name, contact_name, phone, email, is_active
     FROM suppliers
     ORDER BY is_active DESC, legal_name, id
     LIMIT 250`,
  );
  const params = await searchParams;
  const error = firstValue(params.error);
  const message =
    error === "invalid"
      ? "Revisa los datos del proveedor."
      : error === "not-found"
        ? "No se encontró el proveedor."
        : error
          ? "No fue posible guardar los cambios."
          : undefined;

  return (
    <main className="dashboard-page">
      <ManagerNav user={user} />
      <div className="page-content">
        <div className="page-heading">
          <div>
            <p className="eyebrow">Finanzas</p>
            <h1>Proveedores</h1>
          </div>
          <p>Las cuentas y gastos anteriores se conservan al desactivar un proveedor.</p>
        </div>
        {params.created ? (
          <p className="success-message" role="status">
            Proveedor creado.
          </p>
        ) : null}
        {params.updated ? (
          <p className="success-message" role="status">
            Estado del proveedor actualizado.
          </p>
        ) : null}
        {message ? (
          <p className="form-error" role="alert">
            {message}
          </p>
        ) : null}

        <section className="dashboard-card">
          <h2>Agregar proveedor</h2>
          <form action="/api/finance/suppliers" method="post" className="finance-form">
            <div className="form-grid">
              <label>
                Nombre legal o comercial
                <input maxLength={190} name="legal_name" required />
              </label>
              <label>
                Persona de contacto
                <input maxLength={120} name="contact_name" />
              </label>
              <label>
                Teléfono
                <input maxLength={40} name="phone" type="tel" />
              </label>
              <label>
                Correo
                <input maxLength={190} name="email" type="email" />
              </label>
            </div>
            <label>
              Notas
              <textarea maxLength={2000} name="notes" rows={2} />
            </label>
            <button type="submit">Guardar proveedor</button>
          </form>
        </section>

        <section className="dashboard-card">
          <h2>Directorio</h2>
          {suppliers.length === 0 ? (
            <p className="empty-state">Todavía no hay proveedores.</p>
          ) : (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th scope="col">Proveedor</th>
                    <th scope="col">Contacto</th>
                    <th scope="col">Teléfono</th>
                    <th scope="col">Correo</th>
                    <th scope="col">Estado</th>
                    <th scope="col">Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {suppliers.map((supplier) => {
                    const active = Boolean(supplier.is_active);

                    return (
                      <tr key={String(supplier.id)}>
                        <td>{supplier.legal_name}</td>
                        <td>{supplier.contact_name ?? "—"}</td>
                        <td>{supplier.phone ?? "—"}</td>
                        <td>{supplier.email ?? "—"}</td>
                        <td>{active ? "Activo" : "Inactivo"}</td>
                        <td>
                          <form
                            action={`/api/finance/suppliers/${encodeURIComponent(String(supplier.id))}/status`}
                            method="post"
                          >
                            <input
                              name="is_active"
                              type="hidden"
                              value={active ? "0" : "1"}
                            />
                            <button className="button-secondary" type="submit">
                              {active ? "Desactivar" : "Reactivar"}
                            </button>
                          </form>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
