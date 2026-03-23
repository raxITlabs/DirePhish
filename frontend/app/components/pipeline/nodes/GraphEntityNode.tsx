"use client";

import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";

const KNOWN_TYPE_COLORS: Record<string, string> = {
  person: "var(--color-royal-azure-500)",
  organization: "var(--color-sandy-brown-500)",
  org: "var(--color-sandy-brown-500)",
  agent: "var(--color-royal-azure-500)",
  threat: "var(--color-burnt-peach-500)",
  compliance: "var(--color-tuscan-sun-500)",
  system: "var(--color-verdigris-500)",
  event: "var(--color-tuscan-sun-600)",
  default: "var(--color-pitch-black-400)",
};

const DYNAMIC_PALETTE = [
  "var(--color-royal-azure-400)",
  "var(--color-tuscan-sun-600)",
  "var(--color-burnt-peach-400)",
  "var(--color-verdigris-400)",
  "var(--color-sandy-brown-400)",
];

const _dynamicColorCache: Record<string, string> = {};

function getTypeColor(type: string): string {
  if (KNOWN_TYPE_COLORS[type]) return KNOWN_TYPE_COLORS[type];
  if (_dynamicColorCache[type]) return _dynamicColorCache[type];
  const idx = Object.keys(_dynamicColorCache).length % DYNAMIC_PALETTE.length;
  _dynamicColorCache[type] = DYNAMIC_PALETTE[idx];
  return _dynamicColorCache[type];
}

// Breathe glow — known types get specific glow, others get a generic one
const KNOWN_BREATHE_COLORS: Record<string, string> = {
  person: "oklch(0.55 0.18 250 / 0.5)",
  organization: "oklch(0.65 0.15 60 / 0.5)",
  org: "oklch(0.65 0.15 60 / 0.5)",
  agent: "oklch(0.55 0.18 250 / 0.5)",
  threat: "oklch(0.6 0.2 30 / 0.6)",
  compliance: "oklch(0.65 0.12 85 / 0.5)",
  system: "oklch(0.6 0.15 170 / 0.5)",
  event: "oklch(0.7 0.12 85 / 0.5)",
  default: "oklch(0.5 0 0 / 0.3)",
};

function getBreatheColor(type: string): string {
  return KNOWN_BREATHE_COLORS[type] || KNOWN_BREATHE_COLORS.default;
}

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
  const color = getTypeColor(d.entityType);
  const breatheColor = getBreatheColor(d.entityType);
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
