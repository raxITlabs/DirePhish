"use client";

import { useMemo } from "react";
import { Card } from "@/app/components/ui/card";
import type { GraphNode } from "@/app/types";

const TYPE_COLORS: Record<string, string> = {
  agent: "#3b82f6",
  org: "#f97316",
  threat: "#ef4444",
  compliance: "#a855f7",
  system: "#22c55e",
  event: "#eab308",
  location: "#06b6d4",
  document: "#ec4899",
  process: "#8b5cf6",
  default: "#6b7280",
};

interface GraphLegendProps {
  nodes: GraphNode[];
}

export { TYPE_COLORS };

export default function GraphLegend({ nodes }: GraphLegendProps) {
  const typeCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const node of nodes) {
      const t = node.type || "default";
      counts[t] = (counts[t] || 0) + 1;
    }
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }, [nodes]);

  if (typeCounts.length === 0) return null;

  return (
    <Card className="absolute bottom-3 left-3 z-10 px-3 py-2 shadow-md">
      <div className="flex flex-col gap-1">
        {typeCounts.map(([type, count]) => (
          <div key={type} className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <span
              className="h-2.5 w-2.5 rounded-full shrink-0"
              style={{ background: TYPE_COLORS[type] || TYPE_COLORS.default }}
            />
            <span className="capitalize">{type}</span>
            <span className="ml-auto font-mono text-[10px]">{count}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}
