// frontend/app/components/research/RiskProfile.tsx
"use client";

import type { RiskInfo } from "@/app/types";
import { Input } from "@/app/components/ui/input";
import { Button } from "@/app/components/ui/button";

interface Props {
  risks: RiskInfo[];
  onChange: (risks: RiskInfo[]) => void;
}

const EMPTY_RISK: RiskInfo = {
  name: "",
  likelihood: "medium",
  impact: "medium",
};

const LIKELIHOODS: RiskInfo["likelihood"][] = ["low", "medium", "high"];
const IMPACTS: RiskInfo["impact"][] = ["low", "medium", "high", "critical"];

export default function RiskProfile({ risks, onChange }: Props) {
  const updateRisk = (
    index: number,
    field: keyof RiskInfo,
    value: string
  ) => {
    const updated = risks.map((r, i) =>
      i === index ? { ...r, [field]: value } : r
    );
    onChange(updated);
  };

  const addRisk = () => {
    onChange([...risks, { ...EMPTY_RISK }]);
  };

  const removeRisk = (index: number) => {
    onChange(risks.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-2">
      {risks.length === 0 && (
        <p className="text-sm text-muted-foreground">No risks defined.</p>
      )}
      {risks.map((risk, i) => (
        <div
          key={i}
          className="grid grid-cols-[1fr_auto_auto_auto] gap-2 items-center"
        >
          <Input
            type="text"
            value={risk.name}
            onChange={(e) => updateRisk(i, "name", e.target.value)}
            placeholder="Risk name (e.g. Ransomware)"
            className="text-xs"
          />
          <select
            value={risk.likelihood}
            onChange={(e) => updateRisk(i, "likelihood", e.target.value)}
            className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            {LIKELIHOODS.map((l) => (
              <option key={l} value={l}>
                {l} likelihood
              </option>
            ))}
          </select>
          <select
            value={risk.impact}
            onChange={(e) => updateRisk(i, "impact", e.target.value)}
            className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            {IMPACTS.map((imp) => (
              <option key={imp} value={imp}>
                {imp} impact
              </option>
            ))}
          </select>
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={() => removeRisk(i)}
            className="text-muted-foreground hover:text-destructive"
          >
            x
          </Button>
        </div>
      ))}
      <Button variant="outline" size="sm" onClick={addRisk} className="border-dashed">
        + Add Risk
      </Button>
    </div>
  );
}
