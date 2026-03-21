"use client";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/app/components/ui/card";
import { Badge } from "@/app/components/ui/badge";
import { Clock } from "lucide-react";
import type { CrucibleReport } from "@/app/actions/report";

interface CrucibleTimelineProps {
  events: NonNullable<CrucibleReport["timeline"]>;
}

function significanceBadge(significance: string) {
  const lower = significance.toLowerCase();
  if (lower.includes("high") || lower.includes("critical")) {
    return <Badge variant="destructive" className="text-xs">{significance}</Badge>;
  }
  if (lower.includes("medium") || lower.includes("moderate")) {
    return <Badge variant="secondary" className="text-xs bg-yellow-500/10 text-yellow-700 border-yellow-500/20">{significance}</Badge>;
  }
  return <Badge variant="outline" className="text-xs">{significance}</Badge>;
}

export default function CrucibleTimeline({ events }: CrucibleTimelineProps) {
  if (events.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Clock size={18} />
          Event Timeline
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="relative pl-8">
          {events.map((event, i) => {
            const prevRound = i > 0 ? events[i - 1].round : null;
            const showRound = event.round !== prevRound;
            const isLast = i === events.length - 1;

            return (
              <div key={i} className={`relative ${isLast ? "" : "pb-6"}`}>
                {/* Vertical line */}
                {!isLast && (
                  <div className="absolute left-[-20px] top-6 bottom-0 w-0.5 bg-border" />
                )}
                {/* Round circle */}
                {showRound && (
                  <div className="absolute left-[-28px] top-0.5 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">
                    {event.round}
                  </div>
                )}
                {!showRound && (
                  <div className="absolute left-[-22px] top-2 w-2.5 h-2.5 rounded-full bg-muted-foreground/40" />
                )}
                {/* Event content */}
                <div className="border border-border rounded-lg p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <Badge variant="outline" className="text-xs font-normal">
                      {event.agent}
                    </Badge>
                    {significanceBadge(event.significance)}
                  </div>
                  <p className="text-sm">{event.description}</p>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
