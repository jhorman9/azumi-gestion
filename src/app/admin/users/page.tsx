import { connection } from "next/server";
import type { RowDataPacket } from "mysql2";
import { ManagerNav } from "@/app/components/manager-nav";
import { getDbPool } from "@/lib/db";
import { requirePermission } from "@/lib/auth/roles";

export const instant = false;

interface UserRow extends RowDataPacket {
  id: string | number;
  name: string;
  email: string;
  user_role: string;
  is_active: number;
}

interface AdminUsersPageProps {
  searchParams: Promise<{
    created?: string | string[];
    updated?: string | string[];
    error?: string | string[];
  }>;
}

const errorMessages: Record<string, string> = {
  duplicate: "Ya existe una cuenta con ese correo.",
  invalid: "Revisa los datos del formulario.",
  "invalid-name": "Ingresa el nombre del usuario (máximo 120 caracteres).",
  "invalid-email":
    "Ingresa un correo válido de máximo 190 caracteres.",
  "invalid-password":
    "La contraseña debe tener al menos 12 caracteres y no superar 72 bytes UTF-8.",
  "invalid-role": "Selecciona un rol válido.",
  self: "No puedes desactivar tu propia cuenta.",
  "not-found": "No se encontró el usuario.",
  "last-admin": "No puedes desactivar la última cuenta administradora activa.",
  "role-retired": "El rol de editor de menú fue retirado y no se puede activar.",
};

const roleLabels: Record<string, string> = {
  admin: "Administrador",
  manager: "Gerente",
  menu_editor: "Editor de menú (retirado)",
};

export default async function AdminUsersPage({
  searchParams,
}: AdminUsersPageProps) {
  await connection();
  const actor = await requirePermission("users:manage");
  const [rows] = await getDbPool().execute<UserRow[]>(
    `SELECT id, name, email, user_role, is_active
     FROM users
     ORDER BY name, id`,
  );
  const params = await searchParams;
  const errorCode = Array.isArray(params.error)
    ? params.error[0]
    : params.error;
  const errorMessage = errorCode ? errorMessages[errorCode] : undefined;

  return (
    <main className="dashboard-page">
      <ManagerNav user={actor} />
      <div className="page-content">
        <div className="page-heading">
          <div>
            <p className="eyebrow">Administración</p>
            <h1>Usuarios</h1>
            <p className="page-heading-subtitle">
              Administra el acceso y los roles del equipo.
            </p>
          </div>
        </div>

        {params.created || params.updated ? (
          <p className="success-message" role="status">
            Cambios guardados.
          </p>
        ) : null}
        {errorMessage ? (
          <p className="form-error" role="alert">
            {errorMessage}
          </p>
        ) : null}

        <section className="dashboard-card">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Equipo</p>
              <h2>Crear cuenta</h2>
            </div>
          </div>
          <form action="/api/admin/users" method="post" className="finance-form">
            <div className="form-grid">
              <label>
                Nombre
                <input
                  autoComplete="name"
                  maxLength={120}
                  name="name"
                  required
                />
              </label>
              <label>
                Correo electrónico
                <input
                  autoComplete="email"
                  maxLength={190}
                  name="email"
                  required
                  type="email"
                />
              </label>
              <label>
                Contraseña temporal (mínimo 12 caracteres, máximo 72 bytes UTF-8)
                <input
                  autoComplete="new-password"
                  maxLength={72}
                  minLength={12}
                  name="password"
                  required
                  type="password"
                />
              </label>
              <label>
                Rol
                <select defaultValue="manager" name="role">
                  <option value="admin">Administrador</option>
                  <option value="manager">Gerente</option>
                </select>
              </label>
            </div>
            <button type="submit">Crear usuario</button>
          </form>
        </section>

        <section className="dashboard-card">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Acceso</p>
              <h2>Cuentas existentes</h2>
            </div>
            <span className="table-count">{rows.length} usuarios</span>
          </div>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th scope="col">Nombre</th>
                  <th scope="col">Correo</th>
                  <th scope="col">Rol</th>
                  <th scope="col">Estado</th>
                  <th scope="col">Acción</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const isActive = Boolean(row.is_active);
                  const isCurrentUser = String(row.id) === actor.id;

                  return (
                    <tr key={String(row.id)}>
                      <td>{row.name}</td>
                      <td>{row.email}</td>
                      <td>{roleLabels[row.user_role] ?? row.user_role}</td>
                      <td>{isActive ? "Activo" : "Inactivo"}</td>
                      <td>
                        {row.user_role === "menu_editor" ? (
                          "Rol retirado"
                        ) : isCurrentUser ? (
                          "Tu cuenta"
                        ) : (
                          <form
                            action={`/api/admin/users/${encodeURIComponent(String(row.id))}/status`}
                            method="post"
                          >
                            <input
                              name="is_active"
                              type="hidden"
                              value={isActive ? "0" : "1"}
                            />
                            <button
                              className="button-secondary"
                              type="submit"
                            >
                              {isActive ? "Desactivar" : "Activar"}
                            </button>
                          </form>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
