import { getWorld } from "workflow/runtime";

/**
 * Request a pipeline pause. Writes a pause-requested flag to the pipeline stream.
 * The workflow checks for this flag between steps and suspends if set.
 */
export async function POST(req: Request) {
  const { runId } = await req.json();

  if (!runId) {
    return Response.json({ error: "runId is required" }, { status: 400 });
  }

  try {
    const world = getWorld();

    // Write pause request to the pipeline stream
    await world.writeToStream(
      "pipeline",
      runId,
      JSON.stringify({
        step: "pause_requested",
        status: "running",
        message: "Pause requested by user",
        timestamp: new Date().toISOString(),
      }),
    );

    return Response.json({ data: { runId, status: "pause_requested" } });
  } catch {
    return Response.json(
      { error: "Failed to request pause" },
      { status: 500 },
    );
  }
}
