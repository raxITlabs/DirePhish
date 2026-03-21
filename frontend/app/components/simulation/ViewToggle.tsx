"use client";

import { Button } from "@/app/components/ui/button";

export type ViewMode = "split" | "graph" | "focus";

interface Props {
  mode: ViewMode;
  onChange: (m: ViewMode) => void;
}

export default function ViewToggle({ mode, onChange }: Props) {
  return (
    <div className="flex gap-1 rounded-lg border border-border p-0.5">
      {(["graph", "split", "focus"] as const).map((m) => (
        <Button
          key={m}
          variant={mode === m ? "default" : "ghost"}
          size="sm"
          onClick={() => onChange(m)}
          className="h-7 px-3 text-xs capitalize"
        >
          {m}
        </Button>
      ))}
    </div>
  );
}
