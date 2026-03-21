"use client";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/app/components/ui/card";
import { Badge } from "@/app/components/ui/badge";
import { Users, Zap } from "lucide-react";
import type { CrucibleReport } from "@/app/actions/report";

type AgentScore = NonNullable<CrucibleReport["agentScores"]>[0];

interface CrucibleAgentCardProps {
  agents: AgentScore[];
}

function scoreColor(score: number): string {
  if (score >= 8) return "bg-green-500";
  if (score >= 5) return "bg-yellow-500";
  return "bg-red-500";
}

function scoreTextColor(score: number): string {
  if (score >= 8) return "text-green-600";
  if (score >= 5) return "text-yellow-600";
  return "text-red-600";
}

export default function CrucibleAgentGrid({ agents }: CrucibleAgentCardProps) {
  if (agents.length === 0) return null;

  const sorted = [...agents].sort((a, b) => b.score - a.score);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Users size={18} />
          Agent Performance
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {sorted.map((agent) => (
            <div
              key={agent.name}
              className="border border-border rounded-lg p-4 space-y-3"
            >
              {/* Header */}
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold text-sm">{agent.name}</p>
                  <p className="text-xs text-muted-foreground">{agent.role}</p>
                </div>
                <span className={`text-xl font-bold ${scoreTextColor(agent.score)}`}>
                  {agent.score}<span className="text-xs text-muted-foreground font-normal">/10</span>
                </span>
              </div>

              {/* Score bar */}
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${scoreColor(agent.score)}`}
                  style={{ width: `${agent.score * 10}%` }}
                />
              </div>

              {/* Strengths & Weaknesses */}
              {agent.strengths.length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground">Strengths</p>
                  <div className="flex flex-wrap gap-1">
                    {agent.strengths.map((s, i) => (
                      <Badge
                        key={i}
                        variant="outline"
                        className="text-xs bg-green-500/10 text-green-700 border-green-500/20"
                      >
                        {s}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {agent.weaknesses.length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground">Weaknesses</p>
                  <div className="flex flex-wrap gap-1">
                    {agent.weaknesses.map((w, i) => (
                      <Badge
                        key={i}
                        variant="outline"
                        className="text-xs bg-red-500/10 text-red-700 border-red-500/20"
                      >
                        {w}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* Action count */}
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground pt-1 border-t border-border">
                <Zap size={12} />
                {agent.actionCount} actions
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
