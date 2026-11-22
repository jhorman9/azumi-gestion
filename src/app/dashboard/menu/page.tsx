import { connection } from "next/server";
import { ManagerNav } from "@/app/components/manager-nav";
import { requirePermission } from "@/lib/auth/roles";

export const instant = false;

export default async function MenuHomePage() {
  await connection();
  const user = await requirePermission("menu:manage");

  return (
    <main className="dashboard-page">
      <ManagerNav user={user} />
      <div className="page-content">
        <div className="page-heading">
          <div>
            <p className="eyebrow">Administración del menú</p>
            <h1>Menú digital</h1>
            <p className="page-heading-subtitle">
              Organiza la oferta que ve tu equipo y tus clientes.
            </p>
          </div>
        </div>
        <section className="dashboard-card dashboard-note-card">
          <p className="eyebrow">Próximamente</p>
          <h2>Tu menú, en un solo lugar</h2>
          <p>La gestión de categorías y productos corresponde a la Fase 2.</p>
        </section>
      </div>
    </main>
  );
}
