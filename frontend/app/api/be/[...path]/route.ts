// Authenticated reverse-proxy to the PRIVATE Cloud Run backend.
// The browser calls /api/be/<backend-path> (same origin); this handler forwards
// to the backend with an injected OIDC token and streams the response back
// (works for JSON and for long-lived SSE: /api/be/api/adk/sse/<id>).
import { backendBaseUrl, backendAuthHeaders } from "@/lib/backend";

export const dynamic = "force-dynamic";

async function proxy(req: Request, path: string[]): Promise<Response> {
  const search = new URL(req.url).search;
  const target = `${backendBaseUrl()}/${path.join("/")}${search}`;

  const headers = await backendAuthHeaders();
  const ct = req.headers.get("content-type");
  if (ct) headers["content-type"] = ct;
  const accept = req.headers.get("accept");
  if (accept) headers["accept"] = accept;

  const init: RequestInit = { method: req.method, headers };
  if (req.method !== "GET" && req.method !== "HEAD") {
    init.body = await req.arrayBuffer();
  }

  let upstream: Response;
  try {
    upstream = await fetch(target, init);
  } catch {
    return Response.json({ error: "backend unreachable" }, { status: 502 });
  }

  // Pass through status + body (ReadableStream → streams SSE without buffering).
  const respHeaders = new Headers();
  for (const h of ["content-type", "cache-control"]) {
    const v = upstream.headers.get(h);
    if (v) respHeaders.set(h, v);
  }
  return new Response(upstream.body, {
    status: upstream.status,
    headers: respHeaders,
  });
}

type Ctx = { params: Promise<{ path: string[] }> };

export async function GET(req: Request, ctx: Ctx): Promise<Response> {
  return proxy(req, (await ctx.params).path);
}
export async function POST(req: Request, ctx: Ctx): Promise<Response> {
  return proxy(req, (await ctx.params).path);
}
export async function PUT(req: Request, ctx: Ctx): Promise<Response> {
  return proxy(req, (await ctx.params).path);
}
export async function PATCH(req: Request, ctx: Ctx): Promise<Response> {
  return proxy(req, (await ctx.params).path);
}
export async function DELETE(req: Request, ctx: Ctx): Promise<Response> {
  return proxy(req, (await ctx.params).path);
}
