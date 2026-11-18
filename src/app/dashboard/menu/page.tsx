import { connection } from "next/server";
import { ManagerNav } from "@/app/components/manager-nav";
import { hasPermission, requirePermission } from "@/lib/auth/roles";

export const instant = false;

export default async function MenuHomePage() {
  await connection();
  const user = await requirePermission("menu:manage");

  return (
    <main className="dashboard-page">
      {hasPermission(user.role, "finance:read") ? (
        <ManagerNav user={user} />
      ) : (
        <header className="dashboard-header">
          <div>
            <p className="eyebrow">Administración del menú</p>
            <h1>Hola, {user.name}</h1>
          </div>
          <form action="/api/auth/logout" method="post">
            <button className="button-secondary" type="submit">
              Cerrar sesión
            </button>
          </form>
        </header>
      )}
      <section className="dashboard-card">
        <h2>Menú digital</h2>
        <p>La gestión de categorías y productos corresponde a la Fase 2.</p>
      </section>
    </main>
  );
}
