"use client";

import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";

const TYPE_COLORS: Record<string, string> = {
  agent: "var(--color-royal-azure-500)",
  org: "var(--color-sandy-brown-500)",
  threat: "var(--color-burnt-peach-500)",
  compliance: "var(--color-tuscan-sun-500)",
  system: "var(--color-verdigris-500)",
  event: "var(--color-tuscan-sun-600)",
  location: "var(--color-royal-azure-400)",
  document: "var(--color-burnt-peach-400)",
  process: "var(--color-verdigris-400)",
  default: "var(--color-pitch-black-400)",
};

// Breathe glow colors — slightly transparent versions for drop-shadow
const BREATHE_COLORS: Record<string, string> = {
  agent: "oklch(0.55 0.18 250 / 0.5)",
  org: "oklch(0.65 0.15 60 / 0.5)",
  threat: "oklch(0.6 0.2 30 / 0.6)",
  compliance: "oklch(0.65 0.12 85 / 0.5)",
  system: "oklch(0.6 0.15 170 / 0.5)",
  event: "oklch(0.7 0.12 85 / 0.5)",
  default: "oklch(0.5 0 0 / 0.3)",
};

export interface GraphEntityData {
  name: string;
  entityType: string;
  attributes: Record<string, unknown>;
  summary?: string;
  isSimRunning?: boolean;
  isHighlighted?: boolean;
  isDimmed?: boolean;
}

function GraphEntityNode({ data }: NodeProps) {
  const d = data as unknown as GraphEntityData;
  const color = TYPE_COLORS[d.entityType] || TYPE_COLORS.default;
  const breatheColor = BREATHE_COLORS[d.entityType] || BREATHE_COLORS.default;
  const initials = d.name
    .split(/[\s_-]+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() || "")
    .join("");

  return (
    <>
      <Handle type="target" position={Position.Top} className="!bg-transparent !border-0 !w-0 !h-0" />
      <div
        className="flex flex-col items-center gap-1 cursor-pointer"
        style={{
          opacity: d.isDimmed ? 0.15 : 1,
          transition: "opacity 0.3s ease",
        }}
      >
        <div
          className={`w-10 h-10 rounded-full flex items-center justify-center text-white text-xs font-mono font-bold shadow-sm ${
            d.isSimRunning ? "animate-breathe" : ""
          }`}
          style={{
            backgroundColor: color,
            "--breathe-color": breatheColor,
            boxShadow: d.isHighlighted
              ? "0 0 0 3px var(--color-royal-azure-400), 0 0 12px var(--color-royal-azure-400)"
              : undefined,
          } as React.CSSProperties}
        >
          {initials}
        </div>
        <span className="text-[10px] font-mono text-muted-foreground max-w-[140px] text-center leading-tight bg-card/90 px-1.5 py-0.5 rounded">
          {d.name}
        </span>
      </div>
      <Handle type="source" position={Position.Bottom} className="!bg-transparent !border-0 !w-0 !h-0" />
    </>
  );
}

export default memo(GraphEntityNode);
