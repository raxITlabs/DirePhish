"use client";

import Link from "next/link";
import { Card, CardContent } from "@/app/components/ui/card";
import { Badge } from "@/app/components/ui/badge";
import type { SimulationSummary } from "@/app/types";

function statusBadge(status: string) {
  switch (status) {
    case "running":
      return <Badge variant="default" className="animate-pulse">running</Badge>;
    case "starting":
      return <Badge variant="default" className="animate-pulse">starting</Badge>;
    case "completed":
      return <Badge variant="secondary">completed</Badge>;
    case "stopped":
      return <Badge variant="outline">stopped</Badge>;
    case "failed":
      return <Badge variant="destructive">failed</Badge>;
    default:
      return <Badge variant="secondary">{status}</Badge>;
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
