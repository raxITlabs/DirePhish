// frontend/app/components/configure/PressureCards.tsx
import type { PressureConfig } from "@/app/types";
import { Card, CardContent } from "@/app/components/ui/card";
import { Badge } from "@/app/components/ui/badge";

export default function PressureCards({ pressures }: { pressures: PressureConfig[] }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      {pressures.map((p, i) => (
        <Card key={i} size="sm">
          <CardContent>
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm font-semibold">{p.name}</span>
              <Badge
                variant={p.severityAt25pct === "critical" ? "destructive" : p.severityAt25pct === "high" ? "default" : "secondary"}
              >
                {p.type}
              </Badge>
            </div>
            <div className="text-xs text-muted-foreground space-y-1">
              {p.hours != null && <div>Duration: {p.hours}h</div>}
              {p.value != null && <div>Threshold: {p.value}{p.unit || ""}</div>}
              {p.triggeredBy && <div>Triggered by: {p.triggeredBy}</div>}
              <div>Affects: {p.affectsRoles.join(", ") || "all"}</div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
