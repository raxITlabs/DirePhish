import type { ScheduledEvent } from "@/app/types";
import { Alert, AlertTitle, AlertDescription } from "@/app/components/ui/alert";

export default function EventInjectBanner({ event }: { event: ScheduledEvent }) {
  return (
    <Alert variant="destructive" className="my-3 border-severity-critical-border bg-severity-critical-bg">
      <span className="text-base">🔴</span>
      <AlertTitle className="text-xs font-semibold uppercase">
        Event Inject — Round {event.round}
      </AlertTitle>
      <AlertDescription className="text-sm text-severity-critical mt-0.5">
        {event.description}
      </AlertDescription>
    </Alert>
  );
}
