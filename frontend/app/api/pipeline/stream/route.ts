import { getRun } from "workflow/api";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const runId = url.searchParams.get("runId");

  if (!runId) {
    return Response.json({ error: "runId is required" }, { status: 400 });
  }

  try {
    const run = getRun(runId);
    const readable = run.getReadable({ namespace: "pipeline" });

    // Collect all available updates
    const updates: unknown[] = [];
    const reader = readable.getReader();

    // Read with a short timeout to get all available chunks
    const readWithTimeout = async () => {
      try {
        while (true) {
          const readPromise = reader.read();
          const timeoutPromise = new Promise<{ done: true; value: undefined }>((resolve) =>
            setTimeout(() => resolve({ done: true, value: undefined }), 500)
          );
          const result = await Promise.race([readPromise, timeoutPromise]);
          if (result.done) break;
          updates.push(result.value);
        }
      } catch {
        // stream may not be available yet
      } finally {
        reader.releaseLock();
      }
    };

    await readWithTimeout();

    return Response.json({
      data: {
        runId,
        status: run.status,
        updates,
      },
    });
  } catch {
    return Response.json({
      data: { runId, status: "unknown", updates: [] },
    });
  }
}
