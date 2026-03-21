import type { AgentAction, ScheduledEvent } from "@/app/types";
import { Badge } from "@/app/components/ui/badge";
import { Hash, Mail } from "lucide-react";
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
        <p className="text-muted-foreground text-sm text-center py-8">
          Waiting for actions...
        </p>
      )}
      {actions.map((action, i) => {
        const showRoundDivider = action.round !== lastRound;
        const roundEvent = showRoundDivider
          ? scheduledEvents.find((e) => e.round === action.round)
          : undefined;
        lastRound = action.round;

        const isEmail = action.action.includes("email");
        const summary =
          action.action === "send_email"
            ? `${action.args.subject || "(no subject)"}`
            : `${((action.args.content as string) || "").slice(0, 120)}...`;

        const actionLabel =
          action.action === "send_message" ? "message"
          : action.action === "reply_in_thread" ? "thread"
          : action.action === "send_email" ? "email"
          : action.action === "reply_email" ? "reply"
          : action.action;

        const actionVariant =
          action.action === "reply_in_thread" || action.action === "reply_email"
            ? "secondary" as const
            : "outline" as const;

        return (
          <div key={i}>
            {showRoundDivider && <RoundDivider round={action.round} timestamp={action.timestamp} />}
            {roundEvent && <EventInjectBanner event={roundEvent} />}
            <div className="flex items-start gap-3 py-2">
              <span className="text-xs text-muted-foreground w-16 flex-shrink-0 pt-0.5">
                {new Date(action.timestamp).toLocaleTimeString()}
              </span>
              <span className="w-4 flex-shrink-0 pt-0.5 text-muted-foreground">
                {isEmail ? <Mail className="size-3.5" /> : <Hash className="size-3.5" />}
              </span>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{action.agent}</span>
                  <Badge variant="secondary" className="text-[10px]">{action.role}</Badge>
                  <Badge variant={actionVariant} className="text-[10px]">{actionLabel}</Badge>
                </div>
                <div className="text-xs text-muted-foreground mt-0.5 truncate">{summary}</div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
