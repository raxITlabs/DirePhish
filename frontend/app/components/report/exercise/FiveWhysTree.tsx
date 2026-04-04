"use client";

import { motion } from "motion/react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/app/components/ui/card";
import { AsciiBadge, AsciiEmptyState } from "@/app/components/ascii/DesignSystem";

interface FiveWhysTreeProps {
  rootCauses: Array<{
    issue: string;
    severity: string;
    fiveWhys: Array<{
      level: number;
      question: string;
      answer: string;
    }>;
    rootCause: string;
    scenariosAffected: string[];
  }>;
}

function severityBadgeVariant(severity: string): "destructive" | "default" | "muted" {
  const s = severity.toLowerCase();
  if (s === "critical") return "destructive";
  if (s === "high") return "default";
  return "muted";
}

function SingleTree({ item, index }: { item: FiveWhysTreeProps["rootCauses"][number]; index: number }) {
  const sorted = [...item.fiveWhys].sort((a, b) => a.level - b.level);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <CardTitle className="text-base font-semibold leading-snug">
            {item.issue}
          </CardTitle>
          <AsciiBadge variant={severityBadgeVariant(item.severity)} bracket="square">
            {item.severity}
          </AsciiBadge>
        </div>
        {item.scenariosAffected.length > 0 && (
          <p className="text-xs text-muted-foreground mt-2">
            Scenarios: {item.scenariosAffected.join(" · ")}
          </p>
        )}
      </CardHeader>
      <CardContent>
        <div className="flex flex-col items-center gap-0">
          {/* Issue node (top) */}
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: index * 0.1 }}
            className="w-full max-w-lg border-2 border-border rounded-lg p-3 text-center bg-muted/30"
          >
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
              Observed Issue
            </p>
            <p className="text-sm font-medium">{item.issue}</p>
          </motion.div>

          {/* Why chain */}
          {sorted.map((why, i) => (
            <motion.div
              key={why.level}
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: index * 0.1 + (i + 1) * 0.08 }}
              className="flex flex-col items-center w-full"
            >
              {/* Connector line */}
              <div className="w-px h-6 bg-border" />

              {/* Why node */}
              <div className="w-full max-w-lg border border-border rounded-lg p-3 bg-background">
                <p className="text-xs font-semibold text-muted-foreground mb-1">
                  Why {why.level}
                </p>
                <p className="text-sm font-medium mb-1.5">{why.question}</p>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {why.answer}
                </p>
              </div>
            </motion.div>
          ))}

          {/* Root cause node (bottom) */}
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: index * 0.1 + (sorted.length + 1) * 0.08 }}
            className="flex flex-col items-center w-full"
          >
            <div className="w-px h-6 bg-border" />
            <div className="w-full max-w-lg rounded-lg p-3 text-center border-2 border-burnt-peach-400 bg-burnt-peach-50">
              <p className="text-xs font-semibold uppercase tracking-wider mb-1 text-burnt-peach-700">
                Root Cause
              </p>
              <p className="text-sm font-semibold">{item.rootCause}</p>
            </div>
          </motion.div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function FiveWhysTree({ rootCauses }: FiveWhysTreeProps) {
  if (!rootCauses || rootCauses.length === 0) {
    return (
      <AsciiEmptyState
        title="No root cause analysis data available"
        description="Run the full pipeline to generate 5 Whys analysis."
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {rootCauses.map((item, i) => (
        <SingleTree key={i} item={item} index={i} />
      ))}
    </div>
  );
}
