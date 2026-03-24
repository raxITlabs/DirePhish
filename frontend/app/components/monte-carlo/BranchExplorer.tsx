"use client";

import { useMemo, useState } from "react";
import { motion } from "motion/react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/app/components/ui/card";
import { Badge } from "@/app/components/ui/badge";
import type {
  DecisionPoint,
  SimulationBranch,
} from "@/app/types/monte-carlo";

interface BranchExplorerProps {
  simId: string;
  decisionPoints: DecisionPoint[];
  branches: SimulationBranch[];
  onFork: (round: number, modifications: Record<string, unknown>) => void;
}

/* ── Constants ── */
const TRUNK_LEFT = 20;
const CARD_LEFT = 44;
const ROUND_DOT_SIZE = 8;
const DECISION_DOT_SIZE = 12;

/* ── Helpers ── */
function criticalityColor(criticality: "high" | "medium"): string {
  return criticality === "high"
    ? "var(--color-sandy-brown-500)"
    : "var(--color-verdigris-500)";
}

function criticalityBg(criticality: "high" | "medium"): string {
  return criticality === "high"
    ? "var(--color-sandy-brown-50)"
    : "var(--color-verdigris-50)";
}

function criticalityBorder(criticality: "high" | "medium"): string {
  return criticality === "high"
    ? "var(--color-sandy-brown-200)"
    : "var(--color-verdigris-200)";
}

/* ── Decision Point Card ── */
function DecisionPointCard({
  point,
  index,
  branches,
  onFork,
}: {
  point: DecisionPoint;
  index: number;
  branches: SimulationBranch[];
  onFork: BranchExplorerProps["onFork"];
}) {
  const relatedBranches = branches.filter((b) => b.forkRound === point.round);

  return (
    <motion.div
      initial={{ opacity: 0, x: 16 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.08, duration: 0.3, ease: "easeOut" }}
      className="relative"
      style={{ marginLeft: `${CARD_LEFT}px` }}
    >
      {/* Horizontal connector from trunk to card */}
      <div
        className="absolute top-3"
        style={{
          left: `-${CARD_LEFT - TRUNK_LEFT}px`,
          width: `${CARD_LEFT - TRUNK_LEFT - 6}px`,
          height: "1px",
          backgroundColor: "var(--color-pitch-black-300)",
        }}
      />

      {/* Diamond marker on trunk */}
      <div
        className="absolute"
        style={{
          left: `-${CARD_LEFT - TRUNK_LEFT + DECISION_DOT_SIZE / 2}px`,
          top: `${3 - DECISION_DOT_SIZE / 2}px`,
          width: `${DECISION_DOT_SIZE}px`,
          height: `${DECISION_DOT_SIZE}px`,
          backgroundColor: criticalityColor(point.criticality),
          transform: "rotate(45deg)",
          borderRadius: "2px",
        }}
      />

      {/* Card */}
      <div
        className="rounded-lg border px-3 py-2.5 mb-4"
        style={{
          backgroundColor: criticalityBg(point.criticality),
          borderColor: criticalityBorder(point.criticality),
        }}
      >
        {/* Header row */}
        <div className="flex items-center gap-2 mb-1.5">
          <span
            className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded"
            style={{
              backgroundColor: criticalityColor(point.criticality),
              color: "white",
            }}
          >
            R{point.round}
          </span>
          <span className="text-xs font-medium text-foreground">
            {point.agent}
          </span>
          <Badge
            variant={point.criticality === "high" ? "destructive" : "secondary"}
            className="text-[10px]"
          >
            {point.criticality}
          </Badge>
        </div>

        {/* Action info */}
        <div className="space-y-1 text-xs">
          <div className="flex gap-1">
            <span className="text-muted-foreground flex-shrink-0">Took:</span>
            <span className="font-mono font-medium text-foreground">
              {point.actionTaken}
            </span>
          </div>
          <div className="flex gap-1">
            <span className="text-muted-foreground flex-shrink-0">Alt:</span>
            <span className="font-mono text-muted-foreground">
              {point.alternative}
            </span>
          </div>
          <div className="text-muted-foreground text-[11px] mt-1">
            {point.potentialImpact}
          </div>
        </div>

        {/* Fork button */}
        <button
          onClick={() =>
            onFork(point.round, point.suggestedModification.details)
          }
          className="mt-2 text-[10px] font-mono font-medium uppercase tracking-wider px-2.5 py-1 rounded border border-border bg-card text-muted-foreground hover:text-foreground hover:border-pitch-black-400 transition-colors cursor-pointer"
        >
          What if?
        </button>

        {/* Branch lines and summary cards */}
        {relatedBranches.length > 0 && (
          <div className="mt-3 pt-2 border-t" style={{ borderColor: criticalityBorder(point.criticality) }}>
            {relatedBranches.map((branch) => (
              <BranchSummaryCard key={branch.branchId} branch={branch} />
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
}

/* ── Branch Summary Card ── */
function BranchSummaryCard({ branch }: { branch: SimulationBranch }) {
  const statusColor =
    branch.status === "completed"
      ? "var(--color-verdigris-500)"
      : branch.status === "running"
        ? "var(--color-tuscan-sun-500)"
        : "var(--color-pitch-black-400)";

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="flex items-start gap-2 mb-2 last:mb-0"
    >
      {/* Branch indicator line */}
      <svg width="16" height="20" className="flex-shrink-0 mt-0.5">
        <polyline
          points="0,0 8,10 16,10"
          fill="none"
          stroke="var(--color-pitch-black-300)"
          strokeWidth="1.5"
        />
      </svg>

      <div className="flex-1 rounded border border-border bg-card px-2.5 py-1.5">
        <div className="flex items-center gap-2 mb-0.5">
          <span
            className="w-1.5 h-1.5 rounded-full flex-shrink-0"
            style={{ backgroundColor: statusColor }}
          />
          <span className="text-[10px] font-mono text-muted-foreground">
            {branch.branchId.slice(0, 8)}
          </span>
          <span className="text-[10px] text-muted-foreground">
            fork@R{branch.forkRound}
          </span>
        </div>

        <div className="flex gap-3 text-[10px] font-mono">
          {branch.outcome && (
            <span className="text-foreground font-medium">
              {branch.outcome}
            </span>
          )}
          {branch.containmentRound != null && (
            <span className="text-muted-foreground">
              contained@R{branch.containmentRound}
            </span>
          )}
          <span className="text-muted-foreground">{branch.status}</span>
        </div>
      </div>
    </motion.div>
  );
}

/* ── Round Marker (non-decision rounds) ── */
function RoundMarker({ round, index }: { round: number; index: number }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: index * 0.04, duration: 0.2 }}
      className="relative flex items-center"
      style={{ height: "24px", marginLeft: `${CARD_LEFT}px` }}
    >
      {/* Circle on trunk */}
      <div
        className="absolute rounded-full"
        style={{
          left: `-${CARD_LEFT - TRUNK_LEFT + ROUND_DOT_SIZE / 2}px`,
          top: `${12 - ROUND_DOT_SIZE / 2}px`,
          width: `${ROUND_DOT_SIZE}px`,
          height: `${ROUND_DOT_SIZE}px`,
          backgroundColor: "var(--color-pitch-black-200)",
          border: "2px solid var(--color-pitch-black-100)",
        }}
      />
      <span className="text-[10px] font-mono text-pitch-black-400">
        Round {round}
      </span>
    </motion.div>
  );
}

/* ── Main Component ── */
export default function BranchExplorer({
  simId,
  decisionPoints,
  branches,
  onFork,
}: BranchExplorerProps) {
  const [expanded, setExpanded] = useState(true);

  // Build a combined timeline: all rounds with decision points marked
  const timeline = useMemo(() => {
    const dpRounds = new Set(decisionPoints.map((dp) => dp.round));

    // Determine full round range
    const allRounds = new Set<number>();
    decisionPoints.forEach((dp) => allRounds.add(dp.round));
    branches.forEach((b) => allRounds.add(b.forkRound));

    // Fill in gaps between min and max
    const sorted = [...allRounds].sort((a, b) => a - b);
    if (sorted.length === 0) return [];

    const min = sorted[0];
    const max = sorted[sorted.length - 1];
    const items: Array<
      | { type: "round"; round: number }
      | { type: "decision"; point: DecisionPoint }
    > = [];

    for (let r = min; r <= max; r++) {
      const dp = decisionPoints.find((d) => d.round === r);
      if (dp) {
        items.push({ type: "decision", point: dp });
      } else if (!dpRounds.has(r)) {
        items.push({ type: "round", round: r });
      }
    }

    return items;
  }, [decisionPoints, branches]);

  return (
    <Card>
      <CardHeader className="border-b">
        <CardTitle className="flex items-center gap-2">
          <span>Branch Explorer</span>
          <span className="text-xs font-mono font-normal text-muted-foreground">
            {simId.slice(0, 12)}
          </span>
          <span className="text-[10px] text-muted-foreground">
            {decisionPoints.length} decision point{decisionPoints.length !== 1 ? "s" : ""}
            {" \u00B7 "}
            {branches.length} branch{branches.length !== 1 ? "es" : ""}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {timeline.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            No decision points detected in this simulation.
          </p>
        ) : (
          <div className="relative pt-2 pb-4">
            {/* Trunk vertical line */}
            <div
              className="absolute top-0 bottom-0"
              style={{
                left: `${TRUNK_LEFT}px`,
                width: "2px",
                backgroundColor: "var(--color-pitch-black-300)",
              }}
            />

            {/* Timeline items */}
            {timeline.map((item, i) => {
              if (item.type === "decision") {
                return (
                  <DecisionPointCard
                    key={`dp-${item.point.round}-${item.point.agent}`}
                    point={item.point}
                    index={i}
                    branches={branches}
                    onFork={onFork}
                  />
                );
              }
              return (
                <RoundMarker
                  key={`r-${item.round}`}
                  round={item.round}
                  index={i}
                />
              );
            })}

            {/* Terminal dot */}
            <div
              className="absolute rounded-full"
              style={{
                left: `${TRUNK_LEFT - 4}px`,
                bottom: "0",
                width: "10px",
                height: "10px",
                backgroundColor: "var(--color-pitch-black-400)",
                border: "2px solid var(--color-pitch-black-200)",
              }}
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
