// frontend/app/components/research/SystemsList.tsx
"use client";

import type { SystemInfo } from "@/app/types";

interface Props {
  systems: SystemInfo[];
  onChange: (systems: SystemInfo[]) => void;
}

const EMPTY_SYSTEM: SystemInfo = {
  name: "",
  category: "application",
  criticality: "medium",
};

const CATEGORIES = [
  "database",
  "infrastructure",
  "application",
  "security",
  "communication",
] as const;

const CRITICALITIES: SystemInfo["criticality"][] = [
  "low",
  "medium",
  "high",
  "critical",
];

export default function SystemsList({ systems, onChange }: Props) {
  const updateSystem = (
    index: number,
    field: keyof SystemInfo,
    value: string
  ) => {
    const updated = systems.map((s, i) =>
      i === index ? { ...s, [field]: value } : s
    );
    onChange(updated);
  };

  const addSystem = () => {
    onChange([...systems, { ...EMPTY_SYSTEM }]);
  };

  const removeSystem = (index: number) => {
    onChange(systems.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-2">
      {systems.length === 0 && (
        <p className="text-sm text-text-secondary">No systems defined.</p>
      )}
      {systems.map((sys, i) => (
        <div
          key={i}
          className="grid grid-cols-[1fr_auto_auto_auto] gap-2 items-center"
        >
          <input
            type="text"
            value={sys.name}
            onChange={(e) => updateSystem(i, "name", e.target.value)}
            placeholder="System name (e.g. PostgreSQL)"
            className="border border-border rounded-md px-2 py-1.5 text-xs bg-background focus:outline-none focus:border-accent"
          />
          <select
            value={sys.category}
            onChange={(e) => updateSystem(i, "category", e.target.value)}
            className="border border-border rounded-md px-2 py-1.5 text-xs bg-background focus:outline-none focus:border-accent"
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <select
            value={sys.criticality}
            onChange={(e) => updateSystem(i, "criticality", e.target.value)}
            className="border border-border rounded-md px-2 py-1.5 text-xs bg-background focus:outline-none focus:border-accent"
          >
            {CRITICALITIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <button
            onClick={() => removeSystem(i)}
            className="text-text-tertiary hover:text-severity-critical-text text-xs px-1.5 py-1.5 rounded hover:bg-severity-critical-bg transition-colors"
          >
            ×
          </button>
        </div>
      ))}
      <button
        onClick={addSystem}
        className="text-xs px-3 py-1.5 border border-dashed border-border rounded-md hover:bg-background transition-colors text-text-secondary hover:text-foreground"
      >
        + Add System
      </button>
    </div>
  );
}
