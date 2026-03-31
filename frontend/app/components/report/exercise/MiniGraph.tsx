"use client";

import { useEffect, useState } from "react";
import { getProjectGraph } from "@/app/actions/project";

interface GraphNode {
  id: string;
  name: string;
  type: string;
}

interface KillChainStep {
  step: number;
  tactic: string;
  technique: string;
  target: string;
  description: string;
}

interface MiniGraphProps {
  projectId: string;
  highlightAttackPath?: boolean;
  killChain?: KillChainStep[];
  activeStep?: number;
}

function formatTactic(t: string): string {
  return t.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

function getInitials(name: string): string {
  return name
    .split(/[\s_-]+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() || "")
    .join("");
}

export default function MiniGraph({
  projectId,
  killChain,
  activeStep = 0,
}: MiniGraphProps) {
  const [allNodes, setAllNodes] = useState<GraphNode[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchGraph() {
      try {
        const result = await getProjectGraph(projectId);
        if ("data" in result) {
          setAllNodes((result.data.nodes || []).slice(0, 40));
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
      <div className="min-h-[200px] rounded-lg bg-pitch-black-50 animate-pulse flex items-center justify-center">
        <span className="text-xs text-pitch-black-400">Loading graph...</span>
      </div>
    );
  }

  // If no kill chain, show empty state
  if (!killChain || killChain.length === 0) {
    return (
      <div className="min-h-[200px] rounded-lg bg-pitch-black-50 flex items-center justify-center">
        <span className="text-xs text-pitch-black-400">
          No attack path data available
        </span>
      </div>
    );
  }

  // Build the attack timeline
  const stepCount = killChain.length;
  const padding = { left: 60, right: 60, top: 60, bottom: 80 };
  const width = Math.max(700, stepCount * 130);
  const height = 380;
  const timelineY = height * 0.48;
  const stepSpacing = (width - padding.left - padding.right) / Math.max(stepCount - 1, 1);

  // Identify targeted nodes (from kill chain targets)
  const targetedNames = new Set(killChain.map((s) => s.target.toLowerCase()));

  // Find non-targeted nodes from graph data
  const nonTargeted = allNodes.filter(
    (n) =>
      !targetedNames.has(n.name.toLowerCase()) &&
      n.type !== "threat" &&
      n.type !== "compliance",
  );

  return (
    <div>
      <p className="text-sm font-medium text-pitch-black-600 mb-2">
        Attack Timeline
      </p>
      <div className="rounded-lg border border-pitch-black-100 bg-pitch-black-50/50 overflow-hidden">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full"
          style={{ maxHeight: "400px" }}
          preserveAspectRatio="xMidYMid meet"
        >
          <defs>
            <marker
              id="attack-arrow"
              markerWidth="8"
              markerHeight="6"
              refX="8"
              refY="3"
              orient="auto"
            >
              <polygon points="0,0 8,3 0,6" className="fill-burnt-peach-400" />
            </marker>
            {/* Pulse animation for active step */}
            <filter id="glow">
              <feGaussianBlur stdDeviation="3" result="coloredBlur" />
              <feMerge>
                <feMergeNode in="coloredBlur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Dot grid background */}
          <pattern
            id="timeline-dots"
            x="0"
            y="0"
            width="24"
            height="24"
            patternUnits="userSpaceOnUse"
          >
            <circle cx="12" cy="12" r="0.6" className="fill-pitch-black-200" />
          </pattern>
          <rect width={width} height={height} fill="url(#timeline-dots)" />

          {/* Timeline axis */}
          <line
            x1={padding.left - 20}
            y1={timelineY}
            x2={width - padding.right + 20}
            y2={timelineY}
            className="stroke-pitch-black-200"
            strokeWidth="2"
          />

          {/* Kill chain steps */}
          {killChain.map((step, i) => {
            const x = padding.left + i * stepSpacing;
            const isActive = i === activeStep;
            const opacity = isActive ? 1 : 0.5;
            const nodeY = timelineY - 70 - (isActive ? 10 : 0);
            const nodeR = isActive ? 22 : 16;

            return (
              <g
                key={step.step}
                style={{
                  opacity,
                  transition: "opacity 0.3s ease",
                }}
              >
                {/* Vertical connector from node to timeline */}
                <line
                  x1={x}
                  y1={nodeY + nodeR}
                  x2={x}
                  y2={timelineY - 6}
                  className="stroke-burnt-peach-300"
                  strokeWidth={isActive ? 2 : 1}
                  strokeDasharray={isActive ? undefined : "3,3"}
                />

                {/* Step marker on timeline */}
                <circle
                  cx={x}
                  cy={timelineY}
                  r={isActive ? 7 : 5}
                  className={
                    isActive ? "fill-burnt-peach-500" : "fill-burnt-peach-300"
                  }
                  filter={isActive ? "url(#glow)" : undefined}
                />

                {/* Target system node above timeline */}
                {isActive && (
                  <circle
                    cx={x}
                    cy={nodeY}
                    r={nodeR + 6}
                    className="fill-burnt-peach-100"
                    opacity={0.3}
                  />
                )}
                <circle
                  cx={x}
                  cy={nodeY}
                  r={nodeR}
                  className={
                    isActive
                      ? "fill-royal-azure-100 stroke-burnt-peach-500"
                      : "fill-royal-azure-100 stroke-royal-azure-300"
                  }
                  strokeWidth={isActive ? 2.5 : 1.5}
                />
                <text
                  x={x}
                  y={nodeY + 1}
                  textAnchor="middle"
                  dominantBaseline="central"
                  className={`font-bold ${
                    isActive
                      ? "fill-burnt-peach-700 text-[10px]"
                      : "fill-royal-azure-700 text-[8px]"
                  }`}
                  style={{ fontFamily: "var(--font-geist-mono), monospace" }}
                >
                  {getInitials(step.target)}
                </text>
                {/* Target name */}
                <text
                  x={x}
                  y={nodeY - nodeR - 8}
                  textAnchor="middle"
                  className={`text-[7px] ${
                    isActive
                      ? "fill-pitch-black-700 font-semibold"
                      : "fill-pitch-black-400"
                  }`}
                  style={{ fontFamily: "var(--font-geist-mono), monospace" }}
                >
                  {step.target.length > 14
                    ? step.target.slice(0, 14) + "..."
                    : step.target}
                </text>

                {/* Step number label below timeline */}
                <text
                  x={x}
                  y={timelineY + 20}
                  textAnchor="middle"
                  className={`font-bold ${
                    isActive
                      ? "fill-burnt-peach-600 text-[10px]"
                      : "fill-pitch-black-400 text-[9px]"
                  }`}
                  style={{ fontFamily: "var(--font-geist-mono), monospace" }}
                >
                  Step {i + 1}
                </text>

                {/* Tactic label */}
                <text
                  x={x}
                  y={timelineY + 34}
                  textAnchor="middle"
                  className={`text-[7px] ${
                    isActive
                      ? "fill-pitch-black-600"
                      : "fill-pitch-black-300"
                  }`}
                  style={{ fontFamily: "var(--font-geist-mono), monospace" }}
                >
                  {formatTactic(step.tactic)}
                </text>

                {/* Technique ID */}
                <text
                  x={x}
                  y={timelineY + 46}
                  textAnchor="middle"
                  className={`text-[6px] ${
                    isActive
                      ? "fill-pitch-black-400"
                      : "fill-pitch-black-200"
                  }`}
                  style={{ fontFamily: "var(--font-geist-mono), monospace" }}
                >
                  {step.technique}
                </text>

                {/* Attack flow arrow to next step */}
                {i < stepCount - 1 && (
                  <line
                    x1={x + 12}
                    y1={timelineY}
                    x2={padding.left + (i + 1) * stepSpacing - 12}
                    y2={timelineY}
                    className="stroke-burnt-peach-400"
                    strokeWidth={isActive ? 2.5 : 1.5}
                    markerEnd="url(#attack-arrow)"
                  />
                )}
              </g>
            );
          })}

          {/* Non-targeted nodes below timeline (faded context) */}
          {nonTargeted.slice(0, 12).map((node, i) => {
            const col = i % Math.min(6, Math.ceil(nonTargeted.length / 2));
            const row = Math.floor(i / Math.min(6, Math.ceil(nonTargeted.length / 2)));
            const x =
              padding.left +
              col * ((width - padding.left - padding.right) / Math.min(6, nonTargeted.length));
            const y = timelineY + 70 + row * 40;

            return (
              <g key={node.id} opacity={0.35}>
                <circle
                  cx={x}
                  cy={y}
                  r="10"
                  className="fill-pitch-black-100 stroke-pitch-black-200"
                  strokeWidth="0.5"
                />
                <text
                  x={x}
                  y={y + 1}
                  textAnchor="middle"
                  dominantBaseline="central"
                  className="fill-pitch-black-400 text-[6px]"
                  style={{ fontFamily: "var(--font-geist-mono), monospace" }}
                >
                  {getInitials(node.name)}
                </text>
                <text
                  x={x}
                  y={y + 18}
                  textAnchor="middle"
                  className="fill-pitch-black-300 text-[5px]"
                  style={{ fontFamily: "var(--font-geist-mono), monospace" }}
                >
                  {node.name.length > 10
                    ? node.name.slice(0, 10) + "..."
                    : node.name}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}
