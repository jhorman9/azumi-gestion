import { NextResponse } from "next/server";
import { createSession } from "@/lib/auth/session";
import { verifyCredentials } from "@/lib/auth/credentials";
import { homePathForRole } from "@/lib/auth/roles";
import { hasSameOrigin } from "@/lib/security/origin";
import { loginSchema } from "@/lib/validation/auth";

function errorCode(error: unknown): string {
  return typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string"
    ? error.code
    : "UNKNOWN";
}

export async function POST(request: Request) {
  if (!hasSameOrigin(request)) {
    return NextResponse.json({ error: "Solicitud no válida." }, { status: 403 });
  }

  let formData: FormData;

  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Formulario no válido." }, { status: 400 });
  }

  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return NextResponse.redirect(new URL("/login?error=invalid", request.url), 303);
  }

  try {
    const result = await verifyCredentials(
      parsed.data.email,
      parsed.data.password,
    );

    if (result.status !== "authenticated") {
      return NextResponse.redirect(
        new URL("/login?error=invalid", request.url),
        303,
      );
    }

    await createSession(result.user.id);
    return NextResponse.redirect(
      new URL(homePathForRole(result.user.role), request.url),
      303,
    );
  } catch (error) {
    console.error(`Login request failed (${errorCode(error)}).`);
    return NextResponse.json(
      { error: "No fue posible iniciar sesión. Inténtalo más tarde." },
      { status: 503 },
    );
  }
}
