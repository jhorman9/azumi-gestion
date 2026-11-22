const productionOrigin = "https://admin.azumipty.com";

export function hasSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");

  if (!origin || !host) {
    return false;
  }

  try {
    const originUrl = new URL(origin);
    return (
      (originUrl.protocol === "http:" || originUrl.protocol === "https:") &&
      originUrl.host.toLowerCase() === host.toLowerCase()
    );
  } catch {
    return false;
  }
}

export function getSameOriginUrl(request: Request, path: string): URL {
  const redirectOrigin =
    process.env.NODE_ENV === "production"
      ? productionOrigin
      : request.headers.get("origin");
  if (!redirectOrigin) {
    throw new Error("Cannot build a redirect without an origin.");
  }

  const expectedOrigin = new URL(redirectOrigin).origin;
  const destination = new URL(path, expectedOrigin);
  if (destination.origin !== expectedOrigin) {
    throw new Error("Redirect destination must remain on the request origin.");
  }

  return destination;
}
