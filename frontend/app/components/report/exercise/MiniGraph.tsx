"use client";

import { useEffect, useState } from "react";
import { getProjectGraph } from "@/app/actions/project";

interface GraphNode {
  id: string;
  name: string;
  type: string;
}

interface GraphEdge {
  source: string;
  target: string;
  label: string;
}

interface MiniGraphProps {
  projectId: string;
  highlightAttackPath?: boolean;
}

const TYPE_COLORS: Record<string, { bg: string; text: string }> = {
  person: { bg: "fill-royal-azure-200", text: "fill-royal-azure-800" },
  agent: { bg: "fill-royal-azure-200", text: "fill-royal-azure-800" },
  organization: { bg: "fill-sandy-brown-200", text: "fill-sandy-brown-800" },
  org: { bg: "fill-sandy-brown-200", text: "fill-sandy-brown-800" },
  system: { bg: "fill-verdigris-200", text: "fill-verdigris-800" },
  threat: { bg: "fill-burnt-peach-200", text: "fill-burnt-peach-800" },
  compliance: { bg: "fill-tuscan-sun-200", text: "fill-tuscan-sun-800" },
};

function getInitials(name: string): string {
  return name
    .split(/[\s_-]+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() || "")
    .join("");
}

export default function MiniGraph({ projectId }: MiniGraphProps) {
  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [edges, setEdges] = useState<GraphEdge[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchGraph() {
      try {
        const result = await getProjectGraph(projectId);
        if ("data" in result) {
          setNodes((result.data.nodes || []).slice(0, 30));
          setEdges((result.data.edges || []).slice(0, 50));
        }
      } catch {
        // Non-critical
      } finally {
        setLoading(false);
      }
    }
    fetchGraph();
  }, [projectId]);

  if (loading) {
    return (
      <div className="h-full min-h-[300px] rounded-lg bg-pitch-black-50 animate-pulse flex items-center justify-center">
        <span className="text-xs text-pitch-black-400">Loading graph...</span>
      </div>
    );
  }

  if (nodes.length === 0) {
    return (
      <div className="h-full min-h-[300px] rounded-lg bg-pitch-black-50 flex items-center justify-center">
        <span className="text-xs text-pitch-black-400">No graph data available</span>
      </div>
    );
  }

  // Simple force-directed layout (deterministic positioning)
  const width = 480;
  const height = 300;
  const nodePositions = computeLayout(nodes, edges, width, height);
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-pitch-black-600">Attack Surface</p>
      <div className="rounded-lg border border-pitch-black-100 bg-pitch-black-50/50 overflow-hidden">
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full min-h-[300px]">
          {/* Dot grid background */}
          <pattern id="dots" x="0" y="0" width="20" height="20" patternUnits="userSpaceOnUse">
            <circle cx="10" cy="10" r="0.5" className="fill-pitch-black-200" />
          </pattern>
          <rect width={width} height={height} fill="url(#dots)" />

          {/* Edges */}
          {edges.map((e, i) => {
            const src = nodePositions.get(e.source);
            const tgt = nodePositions.get(e.target);
            if (!src || !tgt) return null;
            const srcNode = nodeMap.get(e.source);
            const isThreat = srcNode?.type === "threat";
            return (
              <line
                key={i}
                x1={src.x} y1={src.y}
                x2={tgt.x} y2={tgt.y}
                strokeWidth={isThreat ? 1.5 : 0.8}
                className={isThreat ? "stroke-burnt-peach-400" : "stroke-pitch-black-200"}
                strokeDasharray={isThreat ? "4 2" : undefined}
                opacity={0.6}
              />
            );
          })}

          {/* Nodes */}
          {nodes.map((n) => {
            const pos = nodePositions.get(n.id);
            if (!pos) return null;
            const colors = TYPE_COLORS[n.type] || { bg: "fill-pitch-black-200", text: "fill-pitch-black-700" };
            const isThreat = n.type === "threat";
            return (
              <g key={n.id}>
                {isThreat && (
                  <circle cx={pos.x} cy={pos.y} r="16" className="fill-burnt-peach-100" opacity={0.4} />
                )}
                <circle cx={pos.x} cy={pos.y} r="12" className={colors.bg} />
                <text
                  x={pos.x} y={pos.y + 1}
                  textAnchor="middle"
                  dominantBaseline="central"
                  className={`${colors.text} text-[7px] font-bold`}
                >
                  {getInitials(n.name)}
                </text>
                <text
                  x={pos.x} y={pos.y + 22}
                  textAnchor="middle"
                  className="fill-pitch-black-500 text-[6px]"
                >
                  {n.name.length > 12 ? n.name.slice(0, 12) + "..." : n.name}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

function computeLayout(
  nodes: GraphNode[],
  edges: GraphEdge[],
  width: number,
  height: number,
): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>();
  const padding = 40;

  // Group by type for clustered layout
  const groups: Record<string, GraphNode[]> = {};
  for (const n of nodes) {
    const type = n.type || "unknown";
    if (!groups[type]) groups[type] = [];
    groups[type].push(n);
  }

  const groupKeys = Object.keys(groups);
  const cols = Math.ceil(Math.sqrt(groupKeys.length));
  const rows = Math.ceil(groupKeys.length / cols);

  groupKeys.forEach((type, gi) => {
    const col = gi % cols;
    const row = Math.floor(gi / cols);
    const cx = padding + ((width - 2 * padding) / (cols)) * (col + 0.5);
    const cy = padding + ((height - 2 * padding) / (rows)) * (row + 0.5);

    const group = groups[type];
    const spread = Math.min(60, (width - 2 * padding) / (cols * 2));
    group.forEach((n, ni) => {
      const angle = (2 * Math.PI * ni) / Math.max(group.length, 1);
      const r = group.length === 1 ? 0 : spread * 0.6;
      positions.set(n.id, {
        x: Math.max(padding, Math.min(width - padding, cx + r * Math.cos(angle))),
        y: Math.max(padding, Math.min(height - padding, cy + r * Math.sin(angle))),
      });
    });
  });

  return positions;
}
