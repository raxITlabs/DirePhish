// frontend/app/components/research/RiskProfile.tsx
"use client";

import { useState } from "react";
import type { RiskInfo } from "@/app/types";
import { Input } from "@/app/components/ui/input";
import { Badge } from "@/app/components/ui/badge";
import { Button } from "@/app/components/ui/button";

interface Props {
  risks: RiskInfo[];
  systemNames?: string[];
  onChange: (risks: RiskInfo[]) => void;
}

const EMPTY_RISK: RiskInfo = {
  name: "",
  likelihood: "medium",
  impact: "medium",
};

const LIKELIHOODS: RiskInfo["likelihood"][] = ["low", "medium", "high"];
const IMPACTS: RiskInfo["impact"][] = ["low", "medium", "high", "critical"];

/** LLM sometimes returns a string instead of string[] — normalize it. */
function toArray(val: unknown): string[] {
  if (Array.isArray(val)) return val;
  if (typeof val === "string" && val.trim()) return val.split(",").map((s) => s.trim());
  return [];
}

export default function RiskProfile({ risks, systemNames = [], onChange }: Props) {
  const [mitigationInputs, setMitigationInputs] = useState<Record<number, string>>({});

  const updateRisk = (
    index: number,
    field: keyof RiskInfo,
    value: unknown
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

  const toggleAffectedSystem = (riskIndex: number, systemName: string) => {
    const current = toArray(risks[riskIndex].affectedSystems);
    const updated = current.includes(systemName)
      ? current.filter((s) => s !== systemName)
      : [...current, systemName];
    updateRisk(riskIndex, "affectedSystems", updated);
  };

  const addMitigation = (riskIndex: number) => {
    const text = (mitigationInputs[riskIndex] ?? "").trim();
    if (!text) return;
    const current = toArray(risks[riskIndex].mitigations);
    updateRisk(riskIndex, "mitigations", [...current, text]);
    setMitigationInputs({ ...mitigationInputs, [riskIndex]: "" });
  };

  const removeMitigation = (riskIndex: number, mitIndex: number) => {
    const current = toArray(risks[riskIndex].mitigations);
    updateRisk(riskIndex, "mitigations", current.filter((_, i) => i !== mitIndex));
  };

  return (
    <div className="space-y-3">
      {risks.length === 0 && (
        <p className="text-sm text-muted-foreground">No risks defined.</p>
      )}
      {risks.map((risk, i) => (
        <div key={i} className="space-y-1.5 border border-border rounded-lg p-2.5">
          <div className="grid grid-cols-[1fr_auto_auto_auto] gap-2 items-center">
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
                  {l}
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
                  {imp}
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

          <Input
            type="text"
            value={risk.description ?? ""}
            onChange={(e) => updateRisk(i, "description", e.target.value)}
            placeholder="Description (e.g. targeting exposed RDP endpoints)"
            className="text-xs text-muted-foreground"
          />

          {systemNames.length > 0 && (
            <div className="flex flex-wrap gap-1">
              <span className="text-[10px] text-muted-foreground leading-6">Affects:</span>
              {systemNames.map((sn) => (
                <Badge
                  key={sn}
                  variant={(toArray(risk.affectedSystems)).includes(sn) ? "default" : "outline"}
                  className="text-[10px] cursor-pointer"
                  onClick={() => toggleAffectedSystem(i, sn)}
                >
                  {sn}
                </Badge>
              ))}
            </div>
          )}

          <div>
            <div className="flex flex-wrap gap-1 mb-1">
              <span className="text-[10px] text-muted-foreground leading-6">Mitigations:</span>
              {(toArray(risk.mitigations)).map((m, mi) => (
                <Badge key={mi} variant="outline" className="text-[10px] gap-0.5">
                  {m}
                  <button
                    onClick={() => removeMitigation(i, mi)}
                    className="text-muted-foreground hover:text-destructive leading-none"
                  >
                    x
                  </button>
                </Badge>
              ))}
            </div>
            <div className="flex gap-1">
              <Input
                type="text"
                value={mitigationInputs[i] ?? ""}
                onChange={(e) =>
                  setMitigationInputs({ ...mitigationInputs, [i]: e.target.value })
                }
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addMitigation(i);
                  }
                }}
                placeholder="Add mitigation..."
                className="flex-1 text-xs h-6"
              />
              <Button variant="outline" size="sm" onClick={() => addMitigation(i)} className="h-6 text-[10px] px-2">
                Add
              </Button>
            </div>
          </div>
        </div>
      ))}
      <Button variant="outline" size="sm" onClick={addRisk} className="border-dashed">
        + Add Risk
      </Button>
    </div>
  );
}
