import type { AgentAction } from "@/app/types";
import { Card } from "@/app/components/ui/card";
import { Badge } from "@/app/components/ui/badge";

interface Props {
  actions: AgentAction[];
}

export default function WorldStats({ actions }: Props) {
  const worldMap = new Map<string, { count: number; latestRound: number }>();

  for (const action of actions) {
    const existing = worldMap.get(action.world);
    if (existing) {
      existing.count++;
      existing.latestRound = Math.max(existing.latestRound, action.round);
    } else {
      worldMap.set(action.world, { count: 1, latestRound: action.round });
    }
  }

  if (worldMap.size === 0) return null;

  return (
    <Card className="flex flex-row items-center gap-4 px-4 py-2">
      {Array.from(worldMap.entries()).map(([world, stats]) => (
        <div key={world} className="flex items-center gap-2">
          <Badge variant="outline">{world}</Badge>
          <span className="text-sm font-mono">{stats.count}</span>
          <span className="text-xs text-muted-foreground">
            actions &middot; R{stats.latestRound}
          </span>
        </div>
      ))}
    </Card>
  );
}
