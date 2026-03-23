import { getWorld } from "workflow/runtime";
import { getRun } from "workflow/api";

interface PipelineOutput {
  projectId?: string;
  simIds?: string[];
  companyName?: string;
  scenarioTitles?: string[];
  status?: string;
}

/**
 * Extract a URL-like string from raw devalue bytes.
 * The input devalue format contains the companyUrl as a plain string.
 */
function extractUrlFromBytes(input: unknown): string | undefined {
  if (!(input instanceof Uint8Array)) return undefined;
  try {
    const text = new TextDecoder().decode(input);
    // devalue format: devl[[1],{"companyUrl":2,...},"https://example.com/",...]
    const urlMatch = text.match(/"(https?:\/\/[^"]+)"/);
    return urlMatch?.[1];
  } catch {
    return undefined;
  }
}

export async function GET() {
  try {
    const world = getWorld();

    // List runs — resolveData "all" gives us raw Uint8Array for input
    const { data: runs } = await world.runs.list({
      resolveData: "all",
    });

    // For completed runs, deserialize returnValue via getRun()
    const mapped = await Promise.all(
      runs.map(async (run) => {
        let companyName: string | undefined;
        let projectId: string | undefined;

        // Extract companyUrl from raw input bytes
        const companyUrl = extractUrlFromBytes(run.input);

        if (run.status === "completed") {
          try {
            const handle = getRun<PipelineOutput>(run.runId);
            const returnValue = await handle.returnValue;
            companyName = returnValue?.companyName;
            projectId = returnValue?.projectId;
          } catch {
            // Run may not have deserializable output
          }
        }

        return {
          runId: run.runId,
          status: run.status,
          companyUrl,
          companyName,
          projectId,
          createdAt: run.createdAt,
          completedAt: run.completedAt,
        };
      })
    );

    // Most recent first
    mapped.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return Response.json({ data: mapped });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to list runs";
    return Response.json({ data: [], error: message });
  }
}
