import type { ActivePressureState } from "@/app/types";

function formatHours(hours: number): string {
  const h = Math.floor(hours);
  const m = Math.floor((hours - h) * 60);
  const s = Math.floor(((hours - h) * 60 - m) * 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function severityClasses(severity: string) {
  if (severity === "critical")
    return "border-severity-critical-border bg-severity-critical-bg text-severity-critical";
  if (severity === "high")
    return "border-severity-high-border bg-severity-high-bg text-severity-high";
  return "border-severity-normal-border bg-severity-normal-bg text-severity-normal";
}

export default function PressureStrip({ pressures }: { pressures: ActivePressureState[] }) {
  if (pressures.length === 0) return null;

  return (
    <div className="flex gap-2 mb-3">
      {pressures.map((p, i) => (
        <div key={i} className={`flex-1 border rounded-lg px-3 py-2 ${severityClasses(p.severity)}`}>
          <div className="text-[10px] font-semibold uppercase tracking-wide">{p.name}</div>
          <div className="text-lg font-bold font-mono mt-0.5">
            {p.remainingHours != null ? formatHours(p.remainingHours) : ""}
            {p.value != null ? `${p.value}${p.unit || ""}` : ""}
          </div>
        </div>
      ))}
    </div>
  );
}
