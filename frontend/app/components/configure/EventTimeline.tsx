// frontend/app/components/configure/EventTimeline.tsx
import type { ScheduledEvent } from "@/app/types";

export default function EventTimeline({ events }: { events: ScheduledEvent[] }) {
  if (events.length === 0) {
    return <p className="text-text-secondary text-sm">No scheduled events.</p>;
  }
  return (
    <div className="border-l-2 border-border pl-4 space-y-4">
      {events.map((event, i) => (
        <div key={i} className="relative">
          <div className="absolute -left-[21px] top-1 w-2.5 h-2.5 rounded-full bg-accent" />
          <div className="text-xs font-mono text-text-secondary mb-1">Round {event.round}</div>
          <div className="text-sm">{event.description}</div>
        </div>
      ))}
    </div>
  );
}
