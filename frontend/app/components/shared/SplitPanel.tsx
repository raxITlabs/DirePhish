"use client";

import { Card } from "@/app/components/ui/card";

export type ViewMode = "split" | "graph" | "focus";

interface SplitPanelProps {
  viewMode: ViewMode;
  leftPanel: React.ReactNode;
  rightPanel: React.ReactNode;
  leftHeader?: React.ReactNode;
  rightHeader?: React.ReactNode;
  splitRatio?: [number, number];
}

export default function SplitPanel({
  viewMode,
  leftPanel,
  rightPanel,
  leftHeader,
  rightHeader,
  splitRatio = [50, 50],
}: SplitPanelProps) {
  const leftWidth = viewMode === "graph" ? "100%" : viewMode === "split" ? `${splitRatio[0]}%` : "0%";
  const rightWidth = viewMode === "focus" ? "100%" : viewMode === "split" ? `${splitRatio[1]}%` : "0%";

  return (
    <div className="flex-1 flex min-h-0 px-4 pb-4 gap-3">
      <div
        className="min-h-0 transition-all duration-300"
        style={{ width: leftWidth, opacity: viewMode === "focus" ? 0 : 1 }}
      >
        <Card className="h-full overflow-hidden flex flex-col">
          {leftHeader && (
            <div className="px-4 py-2 border-b border-border shrink-0 flex items-center justify-between">
              {leftHeader}
            </div>
          )}
          <div className="flex-1 min-h-0">{leftPanel}</div>
        </Card>
      </div>
      <div
        className="min-h-0 transition-all duration-300"
        style={{ width: rightWidth, opacity: viewMode === "graph" ? 0 : 1 }}
      >
        <Card className="h-full overflow-hidden flex flex-col">
          {rightHeader && (
            <div className="px-4 py-2 border-b border-border shrink-0 flex items-center justify-between">
              {rightHeader}
            </div>
          )}
          <div className="flex-1 min-h-0">{rightPanel}</div>
        </Card>
      </div>
    </div>
  );
}
