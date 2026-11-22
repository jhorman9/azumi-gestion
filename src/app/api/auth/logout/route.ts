import { NextResponse } from "next/server";
import { revokeCurrentSession } from "@/lib/auth/session";
import {
  getSameOriginUrl,
  hasSameOrigin,
} from "@/lib/security/origin";

export async function POST(request: Request) {
  if (!hasSameOrigin(request)) {
    return NextResponse.json({ error: "Solicitud no válida." }, { status: 403 });
  }

  await revokeCurrentSession();
  return NextResponse.redirect(getSameOriginUrl(request, "/login"), 303);
}
