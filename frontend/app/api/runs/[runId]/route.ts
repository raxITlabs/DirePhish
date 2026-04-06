import { getRun } from "workflow/api";
import { readdir, unlink } from "fs/promises";
import { join, resolve } from "path";

const WORKFLOW_DATA_DIR = resolve(
  process.env.WORKFLOW_LOCAL_DATA_DIR || join(".next", "workflow-data")
);

async function deleteFilesByPrefix(dir: string, prefix: string) {
  try {
    const files = await readdir(dir);
    await Promise.all(
      files
        .filter((f) => f.startsWith(prefix))
        .map((f) => unlink(join(dir, f)))
    );
  } catch {
    // Directory may not exist
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ runId: string }> }
) {
  const { runId } = await params;

  if (!runId || !runId.startsWith("wrun_")) {
    return Response.json({ error: "Invalid run ID" }, { status: 400 });
  }

  try {
    // Cancel if still running
    try {
      const run = getRun(runId);
      const status = await run.status;
      if (status === "running" || status === "pending") {
        await run.cancel();
      }
    } catch {
      // Run may not exist in runtime
    }

    // Delete all associated files
    await Promise.all([
      deleteFilesByPrefix(join(WORKFLOW_DATA_DIR, "runs"), runId),
      deleteFilesByPrefix(join(WORKFLOW_DATA_DIR, "events"), runId),
      deleteFilesByPrefix(join(WORKFLOW_DATA_DIR, "steps"), runId),
      deleteFilesByPrefix(join(WORKFLOW_DATA_DIR, "streams", "runs"), runId),
      deleteFilesByPrefix(join(WORKFLOW_DATA_DIR, "streams", "chunks"), runId),
    ]);

    return Response.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to delete run";
    return Response.json({ error: message }, { status: 500 });
  }
}
