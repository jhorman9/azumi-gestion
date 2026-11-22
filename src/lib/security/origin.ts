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
  const origin = request.headers.get("origin");
  if (!origin || !hasSameOrigin(request)) {
    throw new Error("Cannot redirect a request without a validated origin.");
  }

  const originUrl = new URL(origin);
  const redirectOrigin =
    process.env.NODE_ENV === "production"
      ? productionOrigin
      : originUrl.origin;
  const destination = new URL(path, redirectOrigin);
  if (destination.origin !== redirectOrigin) {
    throw new Error("Redirect destination must remain on the request origin.");
  }

  return destination;
}
