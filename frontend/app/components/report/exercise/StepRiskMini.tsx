"use client";

import { Card, CardContent } from "@/app/components/ui/card";

interface Props {
  score: number;
  description: string;
  fairIncrement: string;
  inline?: boolean;
}

export default function StepRiskMini({ score, description, fairIncrement, inline }: Props) {
  // Normalize: scores may be 0-10 or 0-100 scale
  const normalizedScore = score <= 10 ? score * 10 : score;
  const ringColor =
    normalizedScore < 40
      ? "border-verdigris-400 text-verdigris-600"
      : normalizedScore < 70
        ? "border-tuscan-sun-400 text-tuscan-sun-600"
        : "border-burnt-peach-400 text-burnt-peach-600";

  const content = (
    <div className="flex items-center gap-3">
      <div
        className={`w-11 h-11 rounded-full border-[3px] flex items-center justify-center text-sm font-bold shrink-0 ${ringColor}`}
      >
        {score % 1 === 0 ? score : score.toFixed(1)}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider mb-0.5">
          Risk at this phase
        </p>
        <p className="text-xs text-foreground/80 leading-snug">
          {description}
        </p>
        {fairIncrement && fairIncrement !== "N/A" && (
          <p className="text-[10px] text-muted-foreground mt-1 font-mono">
            FAIR: {fairIncrement}
          </p>
        )}
      </div>
    </div>
  );

  if (inline) return content;

  return (
    <Card>
      <CardContent>{content}</CardContent>
    </Card>
  );
}
