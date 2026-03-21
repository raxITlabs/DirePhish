// frontend/app/components/research/SystemsList.tsx
"use client";

import type { SystemInfo } from "@/app/types";
import { Input } from "@/app/components/ui/input";
import { Button } from "@/app/components/ui/button";

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
        <p className="text-sm text-muted-foreground">No systems defined.</p>
      )}
      {systems.map((sys, i) => (
        <div
          key={i}
          className="grid grid-cols-[1fr_auto_auto_auto] gap-2 items-center"
        >
          <Input
            type="text"
            value={sys.name}
            onChange={(e) => updateSystem(i, "name", e.target.value)}
            placeholder="System name (e.g. PostgreSQL)"
            className="text-xs"
          />
          <select
            value={sys.category}
            onChange={(e) => updateSystem(i, "category", e.target.value)}
            className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
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
            className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            {CRITICALITIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={() => removeSystem(i)}
            className="text-muted-foreground hover:text-destructive"
          >
            x
          </Button>
        </div>
      ))}
      <Button variant="outline" size="sm" onClick={addSystem} className="border-dashed">
        + Add System
      </Button>
    </div>
  );
}
