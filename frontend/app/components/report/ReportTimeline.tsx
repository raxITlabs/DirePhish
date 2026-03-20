import type { TimelineEntry } from "@/app/types";

const SIG_COLORS = {
  normal: "bg-gray-300",
  high: "bg-severity-high-text",
  critical: "bg-severity-critical-text",
};

export default function ReportTimeline({ entries }: { entries: TimelineEntry[] }) {
  return (
    <div className="border-l-2 border-border pl-4 space-y-4">
      {entries.map((entry, i) => (
        <div key={i} className="relative">
          <div
            className={`absolute -left-[21px] top-1.5 w-2.5 h-2.5 rounded-full ${SIG_COLORS[entry.significance]}`}
          />
          <div className="flex items-center gap-2 text-xs text-text-secondary mb-0.5">
            <span className="font-mono">Round {entry.round}</span>
            {entry.agent && <span>· {entry.agent}</span>}
          </div>
          <p className="text-sm">{entry.description}</p>
        </div>
      ))}
    </div>
  );
}
