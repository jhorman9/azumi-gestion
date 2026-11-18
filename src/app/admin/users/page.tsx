import { connection } from "next/server";
import type { RowDataPacket } from "mysql2";
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
  self: "No puedes desactivar tu propia cuenta.",
  "not-found": "No se encontró el usuario.",
  "last-admin": "No puedes desactivar la última cuenta administradora activa.",
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
      <header className="dashboard-header">
        <div>
          <p className="eyebrow">Administración</p>
          <h1>Usuarios</h1>
        </div>
        <a className="button-secondary text-link" href="/dashboard">
          Volver al inicio
        </a>
      </header>

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
        <h2>Crear cuenta</h2>
        <form action="/api/admin/users" method="post" className="auth-form">
          <label>
            Nombre
            <input autoComplete="name" maxLength={120} name="name" required />
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
            Contraseña temporal (mínimo 12 caracteres)
            <input
              autoComplete="new-password"
              maxLength={72}
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
              <option value="menu_editor">Editor de menú</option>
            </select>
          </label>
          <button type="submit">Crear usuario</button>
        </form>
      </section>

      <section className="dashboard-card">
        <h2>Cuentas existentes</h2>
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
                    <td>{row.user_role}</td>
                    <td>{isActive ? "Activo" : "Inactivo"}</td>
                    <td>
                      {isCurrentUser ? (
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
    </main>
  );
}
