import { start, getRun } from "workflow/api";
import { cruciblePipeline } from "@/app/workflows/crucible-pipeline";

export async function POST(req: Request) {
  const body = await req.json();
  const { companyUrl, userContext, mode } = body;

  if (!companyUrl) {
    return Response.json({ error: "companyUrl is required" }, { status: 400 });
  }

  const run = await start(cruciblePipeline, [{
    companyUrl,
    userContext: userContext || "",
    mode: mode === "test" ? "test" : "standard",
  }]);

  return Response.json({ data: { runId: (run as { id?: string; runId?: string }).id || (run as { id?: string; runId?: string }).runId || String(run) } }, { status: 201 });
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const runId = url.searchParams.get("runId");

  if (!runId) {
    return Response.json({ error: "runId is required" }, { status: 400 });
  }

  const run = getRun(runId);
  return Response.json({ data: { runId, status: run.status } });
}
