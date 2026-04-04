"use client";

import { useState } from "react";
import { X } from "lucide-react";
import type { PipelineRun } from "@/app/types";
import { AsciiStatus } from "@/app/components/ascii/DesignSystem";
import AsciiWatermark from "@/app/components/ascii/AsciiWatermark";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/app/components/ui/alert-dialog";

interface RunHistoryContentProps {
  runs: PipelineRun[];
  onDelete?: (runId: string) => void;
  heading?: string;
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

function getAsciiStatus(status: PipelineRun["status"]): "running" | "complete" | "failed" | "pending" {
  switch (status) {
    case "running":
    case "pending":
      return "running";
    case "completed":
      return "complete";
    case "failed":
    case "cancelled":
      return "failed";
    default:
      return "pending";
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

export default function RunHistoryContent({ runs, onDelete, heading }: RunHistoryContentProps) {
  const [deleteTarget, setDeleteTarget] = useState<PipelineRun | null>(null);

  if (runs.length === 0) {
    return (
      <div className="px-4 py-8 text-center">
        <p className="text-sm text-sidebar-foreground/50 font-mono">
          No runs yet
        </p>
        <p className="text-xs text-sidebar-foreground/30 font-mono mt-1">
          Start an analysis to see history here
        </p>
        <div className="mt-6">
          <AsciiWatermark />
        </div>
      </div>
    );
  }

  function handleDeleteClick(e: React.MouseEvent, run: PipelineRun) {
    e.preventDefault();
    e.stopPropagation();
    setDeleteTarget(run);
  }

  function confirmDelete() {
    if (!deleteTarget) return;
    const runId = deleteTarget.runId;
    setDeleteTarget(null);

    fetch(`/api/runs/${runId}`, { method: "DELETE" })
      .then((res) => {
        if (res.ok) onDelete?.(runId);
      })
      .catch(() => {});
  }

  return (
    <>
      <nav aria-label="Run history">
        <h3 className="font-mono uppercase text-[10.5px] tracking-widest text-sidebar-foreground/50 px-3 mb-2">
          {heading ?? "Runs"}
        </h3>
        <ul className="space-y-0.5">
          {runs.map((run) => {
            const isActive = run.status === "running" || run.status === "pending";
            const isFailed = run.status === "failed" || run.status === "cancelled";

            return (
              <li key={run.runId} className="group">
                <a
                  href={`/pipeline/${run.runId}`}
                  aria-current={isActive ? "page" : undefined}
                  className={`block px-3 py-2.5 rounded-lg transition-colors ${
                    isActive
                      ? "text-sidebar-primary bg-sidebar-accent font-medium"
                      : "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent"
                  }`}
                >
                  {/* Row 1: status indicator + company name */}
                  <span className="flex items-center gap-2.5">
                    <span className="shrink-0">
                      <AsciiStatus status={getAsciiStatus(run.status)} showLabel={false} />
                    </span>
                    <span className="font-mono text-[13px] tracking-tight truncate">
                      {getDisplayName(run)}
                    </span>
                  </span>

                  {/* Row 2: status line + time / delete on hover */}
                  <span className="flex items-center justify-between mt-1 pl-[22px]">
                    <span className={`font-mono text-[10.5px] ${
                      isFailed ? "text-destructive/60" : "text-sidebar-foreground/40"
                    }`}>
                      {getStatusLine(run)}
                    </span>

                    {/* Time — hidden on hover, replaced by delete */}
                    <span className="font-mono text-[10px] text-sidebar-foreground/30 group-hover:hidden">
                      {getRelativeTime(run.createdAt)}
                    </span>

                    {/* Delete — shown on hover */}
                    <button
                      onClick={(e) => handleDeleteClick(e, run)}
                      className="hidden group-hover:flex items-center gap-1 text-[10px] font-mono text-sidebar-foreground/40 hover:text-destructive transition-colors"
                      aria-label="Delete run"
                    >
                      <X className="size-3" />
                    </button>
                  </span>
                </a>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Delete confirmation dialog */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this run?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the{" "}
              <span className="font-medium text-foreground">
                {deleteTarget ? getDisplayName(deleteTarget) : ""}
              </span>{" "}
              run and all associated data. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
