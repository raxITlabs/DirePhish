"use client";

import { useEffect, useRef } from "react";
import type { AgentAction, ScheduledEvent } from "@/app/types";
import RoundDivider from "./RoundDivider";
import EventInjectBanner from "./EventInjectBanner";

const ROLE_COLORS: Record<string, string> = {
  ir_lead: "bg-purple-100 text-purple-700",
  ciso: "bg-green-100 text-green-700",
  ceo: "bg-amber-100 text-amber-700",
  legal: "bg-red-100 text-red-700",
  vp_eng: "bg-yellow-100 text-yellow-700",
  cto: "bg-blue-100 text-blue-700",
  soc_analyst: "bg-teal-100 text-teal-700",
};

function getRoleColor(role: string) {
  return ROLE_COLORS[role] || "bg-gray-100 text-gray-700";
}

interface Props {
  actions: AgentAction[];
  scheduledEvents: ScheduledEvent[];
}

export default function SlackWorld({ actions, scheduledEvents }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [actions.length]);

  const slackActions = actions.filter(
    (a) => a.action === "send_message" || a.action === "reply_in_thread"
  );

  let lastRound = 0;

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-1">
      {slackActions.length === 0 && (
        <p className="text-text-secondary text-sm text-center py-8">
          Waiting for messages...
        </p>
      )}
      {slackActions.map((action, i) => {
        const showRoundDivider = action.round !== lastRound;
        const roundEvent = showRoundDivider
          ? scheduledEvents.find((e) => e.round === action.round)
          : undefined;
        lastRound = action.round;
        const initials = action.agent
          .split(" ")
          .map((n) => n[0])
          .join("")
          .slice(0, 2);
        const content = (action.args.content as string) || "";

        return (
          <div key={i}>
            {showRoundDivider && <RoundDivider round={action.round} timestamp={action.timestamp} />}
            {roundEvent && <EventInjectBanner event={roundEvent} />}
            <div className="flex gap-2 py-2">
              <div
                className={`w-7 h-7 rounded-md flex-shrink-0 flex items-center justify-center text-xs font-bold ${getRoleColor(action.role)}`}
              >
                {initials}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold">{action.agent}</span>
                  <span
                    className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${getRoleColor(action.role)}`}
                  >
                    {action.role}
                  </span>
                  <span className="text-xs text-text-tertiary">
                    {new Date(action.timestamp).toLocaleTimeString()}
                  </span>
                </div>
                <div className="text-sm text-foreground mt-1 whitespace-pre-wrap">{content}</div>
              </div>
            </div>
          </div>
        );
      })}
      <div ref={bottomRef} />
    </div>
  );
}
