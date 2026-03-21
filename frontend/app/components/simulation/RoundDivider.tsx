import { Separator } from "@/app/components/ui/separator";

export default function RoundDivider({ round, timestamp }: { round: number; timestamp?: string }) {
  return (
    <div className="flex items-center gap-3 my-4">
      <Separator className="flex-1" />
      <span className="text-xs text-muted-foreground bg-background px-3 py-1 rounded">
        Round {round}{timestamp ? ` — ${new Date(timestamp).toLocaleTimeString()}` : ""}
      </span>
      <Separator className="flex-1" />
    </div>
  );
}
