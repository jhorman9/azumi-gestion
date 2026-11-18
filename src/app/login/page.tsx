import { connection } from "next/server";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { homePathForRole } from "@/lib/auth/roles";

export const instant = false;

interface LoginPageProps {
  searchParams: Promise<{ error?: string | string[] }>;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  await connection();
  const user = await getCurrentUser();

  if (user) {
    redirect(homePathForRole(user.role));
  }

  const params = await searchParams;
  const hasLoginError = params.error === "invalid";

  return (
    <main className="auth-page">
      <section className="auth-card" aria-labelledby="login-heading">
        <p className="eyebrow">CRM gerencial</p>
        <h1 id="login-heading">Iniciar sesión</h1>
        <p className="description">
          Acceso privado para el equipo autorizado del restaurante.
        </p>
        {hasLoginError ? (
          <p className="form-error" role="alert">
            Credenciales incorrectas o acceso temporalmente limitado.
          </p>
        ) : null}
        <form action="/api/auth/login" method="post" className="auth-form">
          <label>
            Correo electrónico
            <input
              autoComplete="username"
              maxLength={190}
              name="email"
              required
              type="email"
            />
          </label>
          <label>
            Contraseña
            <input
              autoComplete="current-password"
              name="password"
              required
              type="password"
            />
          </label>
          <button type="submit">Entrar</button>
        </form>
      </section>
    </main>
  );
}
