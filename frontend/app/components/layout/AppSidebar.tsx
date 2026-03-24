"use client";

import { useState, useEffect, useCallback } from "react";
import { usePathname } from "next/navigation";
import { ChevronLeft, ChevronRight, Menu } from "lucide-react";
import type { PipelineRun } from "@/app/types";
import RunHistoryContent from "@/app/components/home/RunHistoryContent";
import {
  Sheet,
  SheetContent,
  SheetTrigger,
  SheetTitle,
} from "@/app/components/ui/sheet";

export default function AppSidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();
  const [runs, setRuns] = useState<PipelineRun[]>([]);

  const isPipeline = pathname.startsWith("/pipeline/");
  const isReport = pathname.startsWith("/report/");

  useEffect(() => {
    if (!isPipeline && !isReport) {
      fetch("/api/runs")
        .then((res) => res.json())
        .then((json) => {
          if (json.data) setRuns(json.data);
        })
        .catch(() => {
          // Silently fail — sidebar just shows empty state
        });
    }
  }, [isPipeline, isReport]);

  // Close mobile drawer on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  const handleDelete = useCallback((runId: string) => {
    setRuns((prev) => prev.filter((r) => r.runId !== runId));
  }, []);

  // Pipeline and report pages don't need the sidebar
  if (isPipeline || isReport) return null;

  return (
    <>
      {/* Mobile hamburger button */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetTrigger
          className="fixed top-3 left-3 z-30 md:hidden inline-flex items-center justify-center rounded-lg border border-sidebar-border bg-sidebar p-2 text-sidebar-foreground/60 hover:text-sidebar-foreground transition-colors"
          aria-label="Open navigation"
        >
          <Menu className="size-5" />
        </SheetTrigger>
        <SheetContent side="left" className="w-[17rem] p-0 bg-card border-border/20">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <div className="flex-1 overflow-y-auto p-2 pt-4">
            <RunHistoryContent runs={runs} onDelete={handleDelete} />
          </div>
        </SheetContent>
      </Sheet>

      {/* Desktop sidebar */}
      <aside
        className={`shrink-0 h-full p-2 hidden md:flex flex-col transition-[width] duration-200 ease-in-out ${
          collapsed ? "w-12" : "w-[17rem]"
        }`}
      >
        <div className="bg-card rounded-xl border border-border/20 shadow-sm flex-1 overflow-hidden flex flex-col">
          {/* Sidebar content */}
          {!collapsed && (
            <div className="flex-1 overflow-y-auto p-2">
              <RunHistoryContent runs={runs} onDelete={handleDelete} />
            </div>
          )}

          {/* Collapse/expand toggle at the bottom */}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="shrink-0 flex items-center justify-center py-2 border-t border-border/10 text-muted-foreground/30 hover:text-muted-foreground/60 transition-colors"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? <ChevronRight className="size-3.5" /> : <ChevronLeft className="size-3.5" />}
          </button>
        </div>
      </aside>
    </>
  );
}
