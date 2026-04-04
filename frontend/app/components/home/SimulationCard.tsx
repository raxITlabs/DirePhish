"use client";

import Link from "next/link";
import { Card, CardContent } from "@/app/components/ui/card";
import { AsciiBadge } from "@/app/components/ascii/DesignSystem";
import type { SimulationSummary } from "@/app/types";

function statusBadge(status: string) {
  switch (status) {
    case "running":
      return <AsciiBadge variant="default">running</AsciiBadge>;
    case "starting":
      return <AsciiBadge variant="default">starting</AsciiBadge>;
    case "completed":
      return <AsciiBadge variant="success">completed</AsciiBadge>;
    case "stopped":
      return <AsciiBadge variant="muted">stopped</AsciiBadge>;
    case "failed":
      return <AsciiBadge variant="destructive">failed</AsciiBadge>;
    default:
      return <AsciiBadge variant="secondary">{status}</AsciiBadge>;
  }
}

export default function SimulationCard({ simulation }: { simulation: SimulationSummary }) {
  const href =
    simulation.status === "completed"
      ? `/report/${simulation.simId}`
      : `/simulation/${simulation.simId}`;

  return (
    <Link href={href}>
      <Card size="sm" className="hover:ring-2 hover:ring-primary/30 transition-all cursor-pointer">
        <CardContent className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            <span className="font-mono text-xs text-muted-foreground truncate">
              {simulation.simId}
            </span>
            {statusBadge(simulation.status)}
          </div>
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span>
              Round {simulation.currentRound}/{simulation.totalRounds}
            </span>
            <span>{simulation.actionCount} actions</span>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
