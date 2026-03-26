"use client";

import { memo, useState } from "react";
import { EdgeLabelRenderer, type EdgeProps } from "@xyflow/react";

interface KnowledgeEdgeData {
  label?: string;
  isAction?: boolean;
  isSimRunning?: boolean;
  isHighlighted?: boolean;
  isDimmed?: boolean;
  isActive?: boolean;
  siblingIndex?: number;
  siblingCount?: number;
  showLabel?: boolean;
}

/** Check once at module level whether the user prefers reduced motion. */
const prefersReducedMotion =
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function KnowledgeEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  data,
  style,
}: EdgeProps) {
  const [hovered, setHovered] = useState(false);
  const d = (data || {}) as KnowledgeEdgeData;

  const {
    label = "",
    isAction = false,
    isHighlighted = false,
    isDimmed = false,
    isActive = false,
    siblingIndex = 0,
    siblingCount = 1,
    showLabel = false,
  } = d;

  // Parallel edge offset — curve away from center for multiple edges between same pair
  const offset = siblingCount > 1
    ? ((siblingIndex - (siblingCount - 1) / 2) * 50)
    : 0;

  // Compute perpendicular offset direction
  const dx = targetX - sourceX;
  const dy = targetY - sourceY;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  // Perpendicular unit vector
  const px = -dy / len;
  const py = dx / len;

  // Control point at midpoint + perpendicular offset
  const midX = (sourceX + targetX) / 2 + px * offset;
  const midY = (sourceY + targetY) / 2 + py * offset;

  // Quadratic bezier path
  const edgePath = `M ${sourceX} ${sourceY} Q ${midX} ${midY} ${targetX} ${targetY}`;

  // Label position at curve midpoint (t=0.5 on quadratic bezier)
  const labelX = sourceX * 0.25 + midX * 0.5 + targetX * 0.25;
  const labelY = sourceY * 0.25 + midY * 0.5 + targetY * 0.25;

  // Colors
  const strokeColor = isActive
    ? "var(--color-royal-azure-400)"
    : isAction
      ? "var(--color-burnt-peach-400)"
      : isHighlighted
        ? "var(--color-royal-azure-400)"
        : isDimmed
          ? "var(--color-pitch-black-200)"
          : "var(--color-pitch-black-300)";

  const strokeWidth = isActive ? 2 : isHighlighted ? 1.5 : 1;
  const opacity = isDimmed ? 0.08 : isActive ? 0.85 : isHighlighted ? 0.45 : 0.25;

  // Particle color
  const particleColor = isAction
    ? "var(--color-burnt-peach-400)"
    : "var(--color-royal-azure-400)";

  const showParticles = isActive && !isDimmed && !prefersReducedMotion;

  return (
    <g
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Invisible wider hit area for hover detection */}
      <path
        d={edgePath}
        fill="none"
        stroke="transparent"
        strokeWidth={20}
        style={{ cursor: "pointer" }}
      />

      {/* Visible edge path */}
      <path
        id={`edge-path-${id}`}
        d={edgePath}
        fill="none"
        stroke={strokeColor}
        strokeWidth={strokeWidth}
        opacity={opacity}
        style={{
          transition: "stroke 0.3s ease, opacity 0.3s ease, stroke-width 0.3s ease",
          ...style,
        }}
      />

      {/* Flowing particles along edge — only when active */}
      {showParticles && [0, 1, 2].map(i => (
        <circle key={i} r="2" fill={particleColor} opacity={0.7 - i * 0.1}>
          <animateMotion
            dur="3s"
            repeatCount="indefinite"
            path={edgePath}
            begin={`${i}s`}
            calcMode="spline"
            keySplines="0.42 0 0.58 1"
          />
        </circle>
      ))}

      {/* Edge label — show on hover or when showLabel is true */}
      {label && (hovered || showLabel) && (
        <EdgeLabelRenderer>
          <div
            className="nodrag nopan"
            style={{
              position: "absolute",
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              pointerEvents: "none",
            }}
          >
            <span className="px-1.5 py-0.5 rounded text-[9px] font-mono bg-card/95 text-muted-foreground border border-border/20 shadow-sm whitespace-nowrap">
              {label}
            </span>
          </div>
        </EdgeLabelRenderer>
      )}
    </g>
  );
}

export default memo(KnowledgeEdge);
