import { resumeHook } from "workflow/api";

export async function POST(req: Request) {
  const body = await req.json();
  const { token, confirmed, scenarioOverrides } = body;

  if (!token) {
    return Response.json({ error: "token is required" }, { status: 400 });
  }

  try {
    const result = await resumeHook(token, {
      confirmed: confirmed !== false,
      scenarioOverrides: scenarioOverrides || [],
    });
    return Response.json({ data: { runId: result.runId } });
  } catch {
    return Response.json({ error: "Invalid or expired token" }, { status: 400 });
  }
}
