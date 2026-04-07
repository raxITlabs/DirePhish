/**
 * Cancel a pipeline run.
 *
 * WDK doesn't expose world.runs.cancel() in the current version.
 * Instead we write a "cancelled" event to the pipeline stream so the
 * frontend stops polling and shows a cancelled state. The backend Flask
 * processes already running will finish their current step but the
 * workflow won't advance to the next one.
 */
import { getWorld } from "workflow/runtime";

export async function POST(req: Request) {
  const { runId } = await req.json();

  if (!runId) {
    return Response.json({ error: "runId is required" }, { status: 400 });
  }

  try {
    const world = getWorld();

    // Write a cancellation event to the pipeline stream
    await world.writeToStream(
      "pipeline",
      runId,
      JSON.stringify({
        step: "cancelled",
        status: "failed",
        message: "Pipeline cancelled by user",
        timestamp: new Date().toISOString(),
      }),
    );

    return Response.json({ data: { runId, status: "cancelled" } });
  } catch {
    return Response.json(
      { error: "Failed to cancel workflow run" },
      { status: 500 },
    );
  }
}
