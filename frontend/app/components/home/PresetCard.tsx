import Link from "next/link";
import { Card, CardContent } from "@/app/components/ui/card";
import { Badge } from "@/app/components/ui/badge";
import type { Preset } from "@/app/types";

export default function PresetCard({ preset }: { preset: Preset }) {
  return (
    <Link href={`/configure/${preset.id}`}>
      <Card className="h-full transition-all hover:shadow-md hover:border-primary cursor-pointer">
        <CardContent className="p-5">
          <div className="flex items-center gap-2 mb-2">
            <Badge variant="secondary" className="text-[10px] uppercase tracking-wide">
              {preset.industry}
            </Badge>
            <span className="text-xs text-muted-foreground">{preset.size}</span>
          </div>
          <h3 className="text-base font-semibold mb-1">{preset.name}</h3>
          <p className="text-sm text-muted-foreground mb-3 line-clamp-2">{preset.description}</p>
          <div className="flex gap-2 flex-wrap">
            {preset.worldTypes.map((w) => (
              <Badge key={w} variant="outline" className="text-xs font-mono">
                {w}
              </Badge>
            ))}
            <Badge variant="outline" className="text-xs font-mono">
              {preset.pressureCount} pressures
            </Badge>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
