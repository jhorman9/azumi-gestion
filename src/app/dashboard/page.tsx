import Link from "next/link";
import { connection } from "next/server";
import { hasPermission, requirePermission } from "@/lib/auth/roles";

export const instant = false;

export default async function DashboardPage() {
  await connection();
  const user = await requirePermission("dashboard:read");

  return (
    <main className="dashboard-page">
      <header className="dashboard-header">
        <div>
          <p className="eyebrow">CRM gerencial</p>
          <h1>Bienvenido, {user.name}</h1>
        </div>
        <form action="/api/auth/logout" method="post">
          <button className="button-secondary" type="submit">
            Cerrar sesión
          </button>
        </form>
      </header>
      <section className="dashboard-card">
        <h2>Fase 1 en preparación</h2>
        <p>
          Tu sesión es privada. Los cierres y reportes aparecerán aquí cuando se
          complete esa parte del sistema.
        </p>
        <p className="account-info">
          {user.email} · {user.role}
        </p>
        {hasPermission(user.role, "users:manage") ? (
          <Link className="text-link" href="/admin/users">
            Administrar usuarios
          </Link>
        ) : null}
      </section>
    </main>
  );
}
