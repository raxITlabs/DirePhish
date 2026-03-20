import type { ScheduledEvent } from "@/app/types";

export default function EventInjectBanner({ event }: { event: ScheduledEvent }) {
  return (
    <div className="border border-severity-critical-border bg-severity-critical-bg rounded-lg px-4 py-3 my-3 flex items-start gap-2">
      <span className="text-base">🔴</span>
      <div>
        <div className="text-xs font-semibold text-severity-critical-text uppercase">
          Event Inject — Round {event.round}
        </div>
        <div className="text-sm text-severity-critical-text mt-0.5">{event.description}</div>
      </div>
    </div>
  );
}
