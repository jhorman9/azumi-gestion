import {
  CookingPot,
  LogOut,
  Store,
} from "lucide-react";
import { SidebarLink } from "@/app/components/sidebar-link";
import { hasPermission } from "@/lib/auth/roles";
import type { SessionUser } from "@/lib/auth/session";

export function ManagerNav({
  user,
  previewMode = false,
}: {
  user: SessionUser;
  previewMode?: boolean;
}) {
  const canReadDashboard = hasPermission(user.role, "dashboard:read");
  const canReadClosings = hasPermission(user.role, "closings:read");
  const canReadFinance = hasPermission(user.role, "finance:read");
  const canManageUsers = hasPermission(user.role, "users:manage");

  return (
    <>
      <aside className="manager-sidebar">
        <div className="sidebar-brand">
          <span aria-hidden="true" className="sidebar-brand-mark">
            <CookingPot size={22} strokeWidth={1.8} />
          </span>
          <span className="sidebar-brand-copy">
            <strong>AZUMI</strong>
            <small>GESTIÓN</small>
          </span>
        </div>

        <div className="sidebar-restaurant">
          <span aria-hidden="true" className="restaurant-mark">
            <Store size={17} />
          </span>
          <span>
            <strong>Restaurante Azumi</strong>
            <small>Panel administrativo</small>
          </span>
        </div>

        <nav aria-label="Navegación principal" className="sidebar-navigation">
          {canReadDashboard || canReadClosings || canReadFinance ? (
            <div className="sidebar-nav-group">
              <p className="sidebar-section-label">OPERACIÓN</p>
              {canReadDashboard ? (
                <SidebarLink href="/dashboard" icon="dashboard">
                  Resumen
                </SidebarLink>
              ) : null}
              {canReadClosings ? (
                <SidebarLink href="/dashboard/closings" icon="closings">
                  Cierres de caja
                </SidebarLink>
              ) : null}
              {canReadFinance ? (
                <SidebarLink href="/dashboard/expenses" icon="expenses">
                  Gastos
                </SidebarLink>
              ) : null}
            </div>
          ) : null}

          {canReadFinance ? (
            <div className="sidebar-nav-group">
              <p className="sidebar-section-label">FINANZAS</p>
              <SidebarLink href="/dashboard/suppliers" icon="suppliers">
                Proveedores
              </SidebarLink>
              <SidebarLink href="/dashboard/bills" icon="bills">
                Cuentas por pagar
              </SidebarLink>
              <SidebarLink href="/dashboard/reports" icon="reports">
                Informes
              </SidebarLink>
              <SidebarLink href="/dashboard/tips" icon="tips">
                Propinas
              </SidebarLink>
            </div>
          ) : null}

          {canManageUsers ? (
            <div className="sidebar-nav-group">
              <p className="sidebar-section-label">ADMINISTRACIÓN</p>
              <SidebarLink href="/admin/users" icon="users">
                Usuarios
              </SidebarLink>
            </div>
          ) : null}

          {canReadFinance ? (
            <div className="sidebar-nav-group">
              <p className="sidebar-section-label">CONTROL</p>
              <SidebarLink href="/dashboard/audit" icon="audit">
                Auditoría
              </SidebarLink>
            </div>
          ) : null}
        </nav>

        <div className="sidebar-footer">
          <div aria-hidden="true" className="user-avatar">
            {user.name
              .split(/\s+/)
              .slice(0, 2)
              .map((part) => part[0]?.toUpperCase())
              .join("")}
          </div>
          <div className="sidebar-user-copy">
            <strong>{user.name}</strong>
            <span>{user.role === "admin" ? "Administrador" : user.role}</span>
          </div>
          <form action="/api/auth/logout" method="post">
            <button
              aria-label="Cerrar sesión"
              className="sidebar-logout"
              title="Cerrar sesión"
              disabled={previewMode}
              type="submit"
            >
              <LogOut aria-hidden="true" size={18} />
            </button>
          </form>
        </div>
      </aside>

      <header className="manager-topbar">
        <div className="topbar-context">
          <span>Azumi</span>
          <span aria-hidden="true">/</span>
          <strong>{previewMode ? "Vista de diseño" : "Centro de gestión"}</strong>
        </div>
        <div className="topbar-status">
          <span aria-hidden="true" className="status-dot" />
          {previewMode ? "Vista previa" : "Sesión segura"}
        </div>
      </header>
    </>
  );
}
