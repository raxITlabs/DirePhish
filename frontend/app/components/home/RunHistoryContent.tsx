import type { PipelineRun } from "@/app/types";

interface RunHistoryContentProps {
  runs: PipelineRun[];
}

function getDisplayName(run: PipelineRun): string {
  if (run.companyName) return run.companyName;
  if (run.companyUrl) {
    try {
      return new URL(
        run.companyUrl.startsWith("http") ? run.companyUrl : `https://${run.companyUrl}`
      ).hostname.replace(/^www\./, "");
    } catch {
      return run.companyUrl;
    }
  }
  return "Untitled run";
}

function getStatusLine(run: PipelineRun): string {
  switch (run.status) {
    case "running":
    case "pending":
      return "In progress...";
    case "completed":
      return "Report ready";
    case "failed":
      return "Failed";
    case "cancelled":
      return "Cancelled";
    default:
      return run.status;
  }
}

function getStatusIndicator(status: PipelineRun["status"]): string {
  switch (status) {
    case "running":
    case "pending":
      return "◉";
    case "completed":
      return "✓";
    case "failed":
    case "cancelled":
      return "✗";
    default:
      return "○";
  }
}

function getRelativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMs / 3600000);
  const diffDay = Math.floor(diffMs / 86400000);

  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay === 1) return "yesterday";
  if (diffDay < 30) return `${diffDay}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

export default function RunHistoryContent({ runs }: RunHistoryContentProps) {
  if (runs.length === 0) {
    return (
      <div className="px-4 py-8 text-center">
        <p className="text-sm text-sidebar-foreground/50 font-mono">
          No runs yet
        </p>
        <p className="text-xs text-sidebar-foreground/30 font-mono mt-1">
          Start an analysis to see history here
        </p>
      </div>
    );
  }

  return (
    <nav>
      <h3 className="font-mono uppercase text-[10.5px] tracking-widest text-sidebar-foreground/50 px-3 mb-2">
        Runs
      </h3>
      <ul className="space-y-0.5">
        {runs.map((run) => {
          const isActive = run.status === "running" || run.status === "pending";
          const isFailed = run.status === "failed" || run.status === "cancelled";

          return (
            <li key={run.runId}>
              <a
                href={`/pipeline/${run.runId}`}
                className={`flex items-start gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                  isActive
                    ? "text-sidebar-primary bg-sidebar-accent font-medium"
                    : "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent"
                }`}
              >
                <span className={`text-[13px] mt-0.5 shrink-0 ${isFailed ? "text-destructive/70" : ""}`}>
                  {getStatusIndicator(run.status)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="font-mono text-sm tracking-tight truncate">
                      {getDisplayName(run)}
                    </span>
                    <span className="font-mono text-[10px] text-sidebar-foreground/40 shrink-0">
                      {getRelativeTime(run.createdAt)}
                    </span>
                  </span>
                  <span className={`block font-mono text-[11px] mt-0.5 ${
                    isFailed ? "text-destructive/60" : "text-sidebar-foreground/40"
                  }`}>
                    {getStatusLine(run)}
                  </span>
                </span>
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
