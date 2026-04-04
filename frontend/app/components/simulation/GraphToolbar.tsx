// frontend/app/components/simulation/GraphToolbar.tsx
"use client";

import { useMemo } from "react";
import { Input } from "@/app/components/ui/input";
import { Badge } from "@/app/components/ui/badge";
import { Button } from "@/app/components/ui/button";
import { TYPE_COLORS } from "./GraphLegend";
import type { GraphNode, GraphEdge } from "@/app/types";

const EDGE_FILTER_OPTIONS = [
  { value: "all", label: "All edges" },
  { value: "communication", label: "Communication" },
  { value: "hierarchy", label: "Hierarchy" },
  { value: "risk", label: "Risk / Threat" },
  { value: "action", label: "Actions" },
] as const;

interface Props {
  nodes: GraphNode[];
  edges: GraphEdge[];
  activeTypes: Set<string>;
  onToggleType: (type: string) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  focusNodeId: string | null;
  onClearFocus: () => void;
  edgeFilter: string;
  onEdgeFilterChange: (filter: string) => void;
  showLabels: boolean;
  onToggleLabels: () => void;
}

export default function GraphToolbar({
  nodes,
  edges,
  activeTypes,
  onToggleType,
  searchQuery,
  onSearchChange,
  focusNodeId,
  onClearFocus,
  edgeFilter,
  onEdgeFilterChange,
  showLabels,
  onToggleLabels,
}: Props) {
  const typeCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const n of nodes) {
      const t = n.type || "default";
      counts[t] = (counts[t] || 0) + 1;
    }
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }, [nodes]);

  const focusNodeName = focusNodeId
    ? nodes.find((n) => n.id === focusNodeId)?.name
    : null;

  return (
    <div className="flex flex-col gap-1.5 px-3 py-2 border-b border-border bg-card/80 backdrop-blur-sm">
      {/* Row 1: Search + Edge filter + Labels toggle */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1 max-w-xs">
          <Input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search nodes..."
            className="h-7 text-xs font-mono pl-7 pr-7"
          />
          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground text-xs">
            /
          </span>
          {searchQuery && (
            <button
              onClick={() => onSearchChange("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground text-xs"
            >
              ✕
            </button>
          )}
        </div>

        <select
          value={edgeFilter}
          onChange={(e) => onEdgeFilterChange(e.target.value)}
          className="h-7 rounded-md border border-input bg-transparent px-2 text-xs font-mono outline-none focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/50"
        >
          {EDGE_FILTER_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>

        <Button
          variant={showLabels ? "default" : "outline"}
          size="sm"
          onClick={onToggleLabels}
          className="h-7 text-xs font-mono px-2"
        >
          Labels
        </Button>

        {focusNodeId && (
          <Badge variant="default" className="h-7 gap-1 text-xs font-mono">
            Focus: {focusNodeName || focusNodeId.slice(0, 8)}
            <button
              onClick={onClearFocus}
              className="text-muted-foreground hover:text-foreground ml-0.5"
            >
              ✕
            </button>
          </Badge>
        )}

        <span className="ml-auto text-[10px] text-muted-foreground font-mono tabular-nums">
          {nodes.length}n · {edges.length}e
        </span>
      </div>

      {/* Row 2: Type filter chips */}
      <div className="flex items-center gap-1 flex-wrap">
        <span className="text-[10px] text-muted-foreground font-mono mr-1">Filter:</span>
        {typeCounts.map(([type, count]) => {
          const isActive = activeTypes.has(type);
          const color = TYPE_COLORS[type] || TYPE_COLORS.default;
          return (
            <button
              key={type}
              onClick={() => onToggleType(type)}
              className={`
                inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono
                border transition-all duration-150
                ${isActive
                  ? "border-border bg-card text-foreground"
                  : "border-transparent bg-muted/40 text-muted-foreground/50 line-through"
                }
              `}
            >
              <span
                className="h-2 w-2 rounded-full shrink-0"
                style={{
                  background: color,
                  opacity: isActive ? 1 : 0.3,
                }}
              />
              <span className="capitalize">{type}</span>
              <span className="text-muted-foreground/60">{count}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
