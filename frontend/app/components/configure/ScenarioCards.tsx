// frontend/app/components/configure/ScenarioCards.tsx
"use client";

import { useState } from "react";
import { Button } from "@/app/components/ui/button";
import type { ScenarioVariant } from "@/app/types";

const severityColors: Record<string, string> = {
  critical: "bg-red-100 text-red-800 border-red-200",
  high: "bg-orange-100 text-orange-800 border-orange-200",
  medium: "bg-yellow-100 text-yellow-800 border-yellow-200",
  low: "bg-green-100 text-green-800 border-green-200",
};

interface ScenarioCardsProps {
  scenarios: ScenarioVariant[];
  onGenerate: (scenarioIds: string[]) => void;
  generating: boolean;
}

export default function ScenarioCards({ scenarios, onGenerate, generating }: ScenarioCardsProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) {
      next.delete(id);
    } else if (next.size < 3) {
      next.add(id);
    }
    setSelected(next);
  };

  return (
    <div>
      <div className="grid gap-4 md:grid-cols-2">
        {scenarios.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => toggle(s.id)}
            className={`text-left rounded-lg border-2 p-4 transition-colors ${
              selected.has(s.id)
                ? "border-primary bg-primary/5"
                : "border-border hover:border-muted-foreground/30"
            }`}
          >
            <div className="flex items-start justify-between gap-2 mb-2">
              <h3 className="font-semibold text-sm leading-tight">{s.title}</h3>
              <span className={`text-xs px-2 py-0.5 rounded-full border font-mono ${severityColors[s.severity] || severityColors.medium}`}>
                {s.severity}
              </span>
            </div>

            <div className="flex items-center gap-3 mb-3 text-xs text-muted-foreground font-mono">
              <span>{Math.round(s.probability * 100)}% likely</span>
              <span>·</span>
              <span>{s.affectedTeams.join(", ")}</span>
            </div>

            <p className="text-sm text-muted-foreground leading-relaxed mb-3">{s.summary}</p>

            {s.evidence.length > 0 && (
              <div className="text-xs text-muted-foreground/70">
                <span className="font-medium">Evidence:</span>
                <ul className="mt-1 space-y-0.5">
                  {s.evidence.slice(0, 3).map((e, i) => (
                    <li key={i} className="pl-2 border-l-2 border-muted">{e}</li>
                  ))}
                </ul>
              </div>
            )}
          </button>
        ))}
      </div>

      <div className="mt-6 flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {selected.size === 0
            ? "Select 1-3 scenarios to simulate"
            : `${selected.size} scenario${selected.size > 1 ? "s" : ""} selected`}
        </p>
        <Button
          onClick={() => onGenerate(Array.from(selected))}
          disabled={selected.size === 0 || generating}
        >
          {generating ? "Generating..." : "Generate Configs"}
        </Button>
      </div>
    </div>
  );
}
