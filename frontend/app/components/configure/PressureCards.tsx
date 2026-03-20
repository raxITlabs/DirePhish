// frontend/app/components/configure/PressureCards.tsx
import type { PressureConfig } from "@/app/types";

function severityColor(severity: string) {
  if (severity === "critical") return "border-severity-critical-border bg-severity-critical-bg text-severity-critical-text";
  if (severity === "high") return "border-severity-high-border bg-severity-high-bg text-severity-high-text";
  return "border-severity-normal-border bg-severity-normal-bg text-severity-normal-text";
}

export default function PressureCards({ pressures }: { pressures: PressureConfig[] }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      {pressures.map((p, i) => (
        <div key={i} className={`border rounded-lg p-4 ${severityColor(p.severityAt25pct)}`}>
          <div className="flex items-center justify-between mb-1">
            <span className="text-sm font-semibold">{p.name}</span>
            <span className="text-xs font-mono uppercase">{p.type}</span>
          </div>
          <div className="text-xs space-y-1">
            {p.hours != null && <div>Duration: {p.hours}h</div>}
            {p.value != null && <div>Threshold: {p.value}{p.unit || ""}</div>}
            {p.triggeredBy && <div>Triggered by: {p.triggeredBy}</div>}
            <div>Affects: {p.affectsRoles.join(", ") || "all"}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
