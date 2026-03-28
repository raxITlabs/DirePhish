import { getRun } from "workflow/api";

// Cache: collect updates from the WDK stream into an array that grows over time.
// Each poll returns the full history (not a new stream reader), avoiding the
// MaxListenersExceededWarning that crashed Turbopack when getReadable() was
// called on every request.
const runUpdates = new Map<string, { updates: unknown[]; draining: boolean }>();

function ensureDraining(runId: string) {
  let entry = runUpdates.get(runId);
  if (entry) return entry;

  entry = { updates: [], draining: false };
  runUpdates.set(runId, entry);

  // Start a single background drain for this run
  if (!entry.draining) {
    entry.draining = true;
    (async () => {
      try {
        const run = getRun(runId);
        const readable = run.getReadable({ namespace: "pipeline" });
        const reader = readable.getReader();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          entry!.updates.push(value);
        }
        reader.releaseLock();
      } catch {
        // stream ended or not available
      }
    })();
  }

  return entry;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const runId = url.searchParams.get("runId");

  if (!runId) {
    return Response.json({ error: "runId is required" }, { status: 400 });
  }

  try {
    const run = getRun(runId);
    const entry = ensureDraining(runId);

    return Response.json({
      data: {
        runId,
        status: run.status,
        updates: entry.updates,
      },
    });
  } catch {
    return Response.json({
      data: { runId, status: "unknown", updates: [] },
    });
  }
}
