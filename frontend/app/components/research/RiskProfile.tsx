// frontend/app/components/research/RiskProfile.tsx
"use client";

import type { RiskInfo } from "@/app/types";

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
        <p className="text-sm text-text-secondary">No risks defined.</p>
      )}
      {risks.map((risk, i) => (
        <div
          key={i}
          className="grid grid-cols-[1fr_auto_auto_auto] gap-2 items-center"
        >
          <input
            type="text"
            value={risk.name}
            onChange={(e) => updateRisk(i, "name", e.target.value)}
            placeholder="Risk name (e.g. Ransomware)"
            className="border border-border rounded-md px-2 py-1.5 text-xs bg-background focus:outline-none focus:border-accent"
          />
          <select
            value={risk.likelihood}
            onChange={(e) => updateRisk(i, "likelihood", e.target.value)}
            className="border border-border rounded-md px-2 py-1.5 text-xs bg-background focus:outline-none focus:border-accent"
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
            className="border border-border rounded-md px-2 py-1.5 text-xs bg-background focus:outline-none focus:border-accent"
          >
            {IMPACTS.map((imp) => (
              <option key={imp} value={imp}>
                {imp} impact
              </option>
            ))}
          </select>
          <button
            onClick={() => removeRisk(i)}
            className="text-text-tertiary hover:text-severity-critical-text text-xs px-1.5 py-1.5 rounded hover:bg-severity-critical-bg transition-colors"
          >
            ×
          </button>
        </div>
      ))}
      <button
        onClick={addRisk}
        className="text-xs px-3 py-1.5 border border-dashed border-border rounded-md hover:bg-background transition-colors text-text-secondary hover:text-foreground"
      >
        + Add Risk
      </button>
    </div>
  );
}
