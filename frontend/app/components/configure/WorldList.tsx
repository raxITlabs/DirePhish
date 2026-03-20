// frontend/app/components/configure/WorldList.tsx
import type { WorldConfig } from "@/app/types";

export default function WorldList({ worlds }: { worlds: WorldConfig[] }) {
  return (
    <div className="flex flex-col gap-2">
      {worlds.map((world, i) => (
        <div key={i} className="flex items-center gap-3 border border-border rounded-lg bg-card px-4 py-3">
          <span className="text-lg">{world.type === "slack" ? "#" : "📧"}</span>
          <div>
            <div className="text-sm font-medium">{world.name}</div>
            <div className="text-xs text-text-secondary font-mono">{world.type}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
