"use client";

export type ViewMode = "graph" | "split" | "focus";

interface Props {
  mode: ViewMode;
  onChange: (mode: ViewMode) => void;
}

const MODES: ViewMode[] = ["graph", "split", "focus"];

export default function ViewToggle({ mode, onChange }: Props) {
  return (
    <div className="flex bg-background rounded-md overflow-hidden border border-border text-xs">
      {MODES.map((m) => (
        <button
          key={m}
          onClick={() => onChange(m)}
          className={`px-3 py-1.5 capitalize transition-colors ${
            mode === m
              ? "bg-card font-semibold shadow-sm"
              : "text-text-secondary hover:text-foreground"
          }`}
        >
          {m === "graph" ? "Graph" : m === "split" ? "Split" : "Focus"}
        </button>
      ))}
    </div>
  );
}
