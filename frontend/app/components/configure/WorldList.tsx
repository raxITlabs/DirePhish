// frontend/app/components/configure/WorldList.tsx
import type { WorldConfig } from "@/app/types";
import { Card, CardContent } from "@/app/components/ui/card";

export default function WorldList({ worlds }: { worlds: WorldConfig[] }) {
  return (
    <div className="flex flex-col gap-2">
      {worlds.map((world, i) => (
        <Card key={i} size="sm">
          <CardContent className="flex items-center gap-3">
            <span className="text-lg">{world.type === "slack" ? "#" : "mail"}</span>
            <div>
              <div className="text-sm font-medium">{world.name}</div>
              <div className="text-xs text-muted-foreground font-mono">{world.type}</div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
