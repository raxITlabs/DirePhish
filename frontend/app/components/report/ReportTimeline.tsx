import type { TimelineEntry } from "@/app/types";
import { Badge } from "@/app/components/ui/badge";
import { Separator } from "@/app/components/ui/separator";

const SIG_VARIANT: Record<string, "secondary" | "default" | "destructive"> = {
  normal: "secondary",
  high: "default",
  critical: "destructive",
};

export default function ReportTimeline({ entries }: { entries: TimelineEntry[] }) {
  return (
    <div className="space-y-4">
      {entries.map((entry, i) => (
        <div key={i}>
          <div className="flex items-center gap-2 mb-1">
            <Badge variant={SIG_VARIANT[entry.significance] ?? "secondary"} className="font-mono text-[10px]">
              Round {entry.round}
            </Badge>
            {entry.agent && (
              <span className="text-xs text-muted-foreground">{entry.agent}</span>
            )}
          </div>
          <p className="text-sm">{entry.description}</p>
          {i < entries.length - 1 && <Separator className="mt-4" />}
        </div>
      ))}
    </div>
  );
}
