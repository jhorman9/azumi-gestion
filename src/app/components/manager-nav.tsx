import Link from "next/link";
import { hasPermission } from "@/lib/auth/roles";
import type { SessionUser } from "@/lib/auth/session";

export function ManagerNav({ user }: { user: SessionUser }) {
  return (
    <header className="manager-header">
      <div className="manager-identity">
        <Link className="manager-brand" href="/dashboard">
          CRM gerencial
        </Link>
        <span>
          {user.name} · {user.role}
        </span>
      </div>
      <nav aria-label="Navegación principal" className="manager-nav">
        <Link href="/dashboard">Resumen</Link>
        <Link href="/dashboard/closings">Cierres</Link>
        <Link href="/dashboard/expenses">Gastos</Link>
        <Link href="/dashboard/suppliers">Proveedores</Link>
        <Link href="/dashboard/bills">Cuentas por pagar</Link>
        <Link href="/dashboard/reports">Informes</Link>
        <Link href="/dashboard/menu">Menú</Link>
        {hasPermission(user.role, "users:manage") ? (
          <Link href="/admin/users">Usuarios</Link>
        ) : null}
      </nav>
      <form action="/api/auth/logout" method="post">
        <button className="button-secondary" type="submit">
          Cerrar sesión
        </button>
      </form>
    </header>
  );
}
