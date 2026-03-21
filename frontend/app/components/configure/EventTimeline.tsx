// frontend/app/components/configure/EventTimeline.tsx
import type { ScheduledEvent } from "@/app/types";
import { Separator } from "@/app/components/ui/separator";

export default function EventTimeline({ events }: { events: ScheduledEvent[] }) {
  if (events.length === 0) {
    return <p className="text-muted-foreground text-sm">No scheduled events.</p>;
  }
  return (
    <div className="space-y-4">
      {events.map((event, i) => (
        <div key={i}>
          <div className="text-xs font-mono text-muted-foreground mb-1">Round {event.round}</div>
          <div className="text-sm">{event.description}</div>
          {i < events.length - 1 && <Separator className="mt-4" />}
        </div>
      ))}
    </div>
  );
}
