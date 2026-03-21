import type { AgentScore } from "@/app/types";
import { Card, CardContent } from "@/app/components/ui/card";
import { Badge } from "@/app/components/ui/badge";

export default function AgentScorecard({ score }: { score: AgentScore }) {
  const pct = (score.score / 10) * 100;
  const color =
    score.score >= 7 ? "bg-green-500" : score.score >= 4 ? "bg-amber-500" : "bg-red-500";

  return (
    <Card size="sm">
      <CardContent>
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="font-semibold text-sm">{score.name}</div>
            <div className="text-xs text-muted-foreground font-mono">{score.role}</div>
          </div>
          <div className="text-right">
            <div className="text-xl font-bold">{score.score}</div>
            <div className="text-[10px] text-muted-foreground">/10</div>
          </div>
        </div>
        <div className="h-1.5 bg-muted rounded-full mb-3">
          <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
        </div>
        {score.strengths.length > 0 && (
          <div className="mb-2">
            <div className="text-[10px] font-semibold text-green-700 uppercase mb-1">Strengths</div>
            <ul className="text-xs text-muted-foreground space-y-0.5">
              {score.strengths.map((s, i) => (
                <li key={i}>+ {s}</li>
              ))}
            </ul>
          </div>
        )}
        {score.weaknesses.length > 0 && (
          <div className="mb-2">
            <div className="text-[10px] font-semibold text-red-700 uppercase mb-1">Weaknesses</div>
            <ul className="text-xs text-muted-foreground space-y-0.5">
              {score.weaknesses.map((w, i) => (
                <li key={i}>- {w}</li>
              ))}
            </ul>
          </div>
        )}
        <div className="text-[10px] text-muted-foreground mt-2">
          {Object.entries(score.worldBreakdown).map(([world, count]) => (
            <Badge key={world} variant="outline" className="mr-1 text-[10px] h-4">
              {world}: {count}
            </Badge>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
