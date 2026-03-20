import type { AgentAction, ScheduledEvent } from "@/app/types";
import RoundDivider from "./RoundDivider";
import EventInjectBanner from "./EventInjectBanner";

interface Props {
  actions: AgentAction[];
  scheduledEvents: ScheduledEvent[];
}

export default function TimelineView({ actions, scheduledEvents }: Props) {
  let lastRound = 0;

  return (
    <div className="flex-1 overflow-y-auto p-4">
      {actions.length === 0 && (
        <p className="text-text-secondary text-sm text-center py-8">
          Waiting for actions...
        </p>
      )}
      {actions.map((action, i) => {
        const showRoundDivider = action.round !== lastRound;
        const roundEvent = showRoundDivider
          ? scheduledEvents.find((e) => e.round === action.round)
          : undefined;
        lastRound = action.round;

        const worldIcon = action.action.includes("email") ? "📧" : "#";
        const summary =
          action.action === "send_email"
            ? `${action.args.subject || "(no subject)"}`
            : `${((action.args.content as string) || "").slice(0, 120)}...`;

        return (
          <div key={i}>
            {showRoundDivider && <RoundDivider round={action.round} timestamp={action.timestamp} />}
            {roundEvent && <EventInjectBanner event={roundEvent} />}
            <div className="flex items-start gap-3 py-2">
              <span className="text-xs text-text-tertiary w-16 flex-shrink-0 pt-0.5">
                {new Date(action.timestamp).toLocaleTimeString()}
              </span>
              <span className="text-sm w-4 flex-shrink-0">{worldIcon}</span>
              <div className="min-w-0">
                <span className="text-sm font-medium">{action.agent}</span>
                <span className="text-xs text-text-secondary ml-2">{action.action}</span>
                <div className="text-xs text-text-secondary mt-0.5 truncate">{summary}</div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
