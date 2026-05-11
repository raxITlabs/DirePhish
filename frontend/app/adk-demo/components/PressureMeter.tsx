// frontend/app/adk-demo/components/PressureMeter.tsx
"use client";

type PressureEvent = {
  kind: string;
  target: string;
  payload: Record<string, unknown>;
  round: number;
};

type PressureMeterProps = {
  events: PressureEvent[];
};

type Severity = "low" | "medium" | "high" | "critical";

function getSeverity(event: PressureEvent): Severity {
  if (event.kind === "severity_changed") {
    const to = String((event.payload as { to?: unknown }).to ?? "").toLowerCase();
    if (to === "critical") return "critical";
    if (to === "high") return "high";
    if (to === "medium") return "medium";
  }
  // Infer from kind
  if (event.kind.includes("critical")) return "critical";
  if (event.kind.includes("escalat")) return "high";
  return "low";
}

const severityConfig: Record<Severity, { bar: string; badge: string; label: string; width: string }> = {
  low: {
    bar: "bg-gray-300",
    badge: "bg-gray-100 text-gray-700 border-gray-300",
    label: "LOW",
    width: "w-1/4",
  },
  medium: {
    bar: "bg-yellow-400",
    badge: "bg-yellow-50 text-yellow-800 border-yellow-300",
    label: "MED",
    width: "w-2/4",
  },
  high: {
    bar: "bg-orange-500",
    badge: "bg-orange-50 text-orange-800 border-orange-300",
    label: "HIGH",
    width: "w-3/4",
  },
  critical: {
    bar: "bg-red-600",
    badge: "bg-red-50 text-red-800 border-red-300",
    label: "CRIT",
    width: "w-full",
  },
};

function getCountdownLabel(event: PressureEvent): string {
  const p = event.payload;
  if (typeof p.countdown === "number") return `T-${p.countdown}`;
  if (typeof p.deadline === "string") return `deadline: ${p.deadline}`;
  if (typeof p.eta === "string") return `ETA: ${p.eta}`;
  if (typeof p.to === "string") return `→ ${p.to}`;
  return event.kind.replace(/_/g, " ");
}

export default function PressureMeter({ events }: PressureMeterProps) {
  if (events.length === 0) {
    return (
      <div className="font-mono text-xs bg-gray-50 border border-gray-200 rounded px-4 py-3">
        <div className="text-gray-400 uppercase tracking-wider text-xs mb-2">pressure meter</div>
        <div className="text-gray-400 italic">no pressure events</div>
      </div>
    );
  }

  return (
    <div className="font-mono text-xs bg-gray-50 border border-gray-200 rounded overflow-hidden">
      {/* Header */}
      <div className="bg-gray-100 border-b border-gray-200 px-3 py-1.5 flex items-center">
        <span className="text-gray-500 uppercase tracking-wider text-xs">pressure meter</span>
        <span className="ml-auto text-gray-400">{events.length} events</span>
      </div>

      {/* Events list */}
      <div className="divide-y divide-gray-100">
        {events.map((event, idx) => {
          const severity = getSeverity(event);
          const cfg = severityConfig[severity];
          const countdown = getCountdownLabel(event);

          return (
            <div key={idx} className="px-3 py-2">
              {/* Target + severity badge */}
              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-gray-700 font-semibold truncate flex-1">{event.target}</span>
                <span className={`flex-shrink-0 px-1.5 py-0.5 text-xs border rounded uppercase font-bold ${cfg.badge}`}>
                  {cfg.label}
                </span>
                <span className="text-gray-400 flex-shrink-0">r{event.round}</span>
              </div>

              {/* Horizontal bar */}
              <div className="h-2 bg-gray-200 rounded-full overflow-hidden mb-1">
                <div className={`h-full rounded-full transition-all ${cfg.bar} ${cfg.width}`} />
              </div>

              {/* Countdown / payload label */}
              <div className="flex items-center gap-2 text-gray-500">
                <span className="uppercase tracking-wide">{event.kind.replace(/_/g, " ")}</span>
                <span className="ml-auto text-gray-600 font-semibold">{countdown}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
