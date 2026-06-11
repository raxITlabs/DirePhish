// Server-only helper to reach the PRIVATE Cloud Run backend with an OIDC token.
// The browser never calls the backend directly — it goes through /api/be/* (see
// app/api/be/[...path]/route.ts), and SSR/server-actions use these helpers.
// On Cloud Run the metadata server mints an ID token for the frontend service
// account (granted run.invoker on the backend). Locally there's no metadata
// server, so no token is added (the local backend is unauthenticated) — which
// is correct for dev.

const BACKEND = process.env.FLASK_API_URL || "http://localhost:5001";

let cached: { token: string; exp: number } | null = null;

async function getIdToken(audience: string): Promise<string | null> {
  const now = Date.now();
  if (cached && cached.exp > now + 60_000) return cached.token;
  try {
    const res = await fetch(
      `http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/identity?audience=${encodeURIComponent(
        audience
      )}`,
      { headers: { "Metadata-Flavor": "Google" } }
    );
    if (!res.ok) return null;
    const token = (await res.text()).trim();
    cached = { token, exp: now + 50 * 60_000 }; // ID tokens ~1h; cache 50 min
    return token;
  } catch {
    return null; // local dev / no metadata server
  }
}

export function backendBaseUrl(): string {
  return BACKEND;
}

/** Returns request headers including an OIDC Bearer token when on Cloud Run. */
export async function backendAuthHeaders(
  extra: Record<string, string> = {}
): Promise<Record<string, string>> {
  const token = await getIdToken(BACKEND);
  return token ? { ...extra, Authorization: `Bearer ${token}` } : extra;
}
