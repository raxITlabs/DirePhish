"use client";

import { useState } from "react";
import type { AgentAction } from "@/app/types";
import RoundDivider from "./RoundDivider";

interface Props {
  actions: AgentAction[];
}

export default function EmailWorld({ actions }: Props) {
  const [expanded, setExpanded] = useState<number | null>(null);

  const emailActions = actions.filter(
    (a) => a.action === "send_email" || a.action === "reply_email"
  );

  let lastRound = 0;

  return (
    <div className="flex-1 overflow-y-auto p-4">
      {emailActions.length === 0 && (
        <p className="text-text-secondary text-sm text-center py-8">
          No emails yet...
        </p>
      )}
      {emailActions.map((action, i) => {
        const showRoundDivider = action.round !== lastRound;
        lastRound = action.round;
        const isExpanded = expanded === i;

        return (
          <div key={i}>
            {showRoundDivider && <RoundDivider round={action.round} />}
            <button
              onClick={() => setExpanded(isExpanded ? null : i)}
              className="w-full text-left border border-border rounded-lg bg-card px-4 py-3 mb-2 hover:border-accent/50 transition-colors"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-sm font-medium truncate">
                    {action.agent}
                  </span>
                  <span className="text-xs text-text-tertiary">→</span>
                  <span className="text-xs text-text-secondary truncate">
                    {(action.args.to as string) || ""}
                  </span>
                </div>
                <span className="text-xs text-text-tertiary flex-shrink-0 ml-2">
                  R{action.round}
                </span>
              </div>
              <div className="text-sm font-medium mt-1 truncate">
                {(action.args.subject as string) || "(no subject)"}
              </div>
              {isExpanded && (
                <div className="mt-3 pt-3 border-t border-border text-sm text-text-secondary whitespace-pre-wrap">
                  {(action.args.body as string) || ""}
                  {(action.args.cc as string | undefined) && (
                    <div className="mt-2 text-xs text-text-tertiary">
                      CC: {action.args.cc as string}
                    </div>
                  )}
                </div>
              )}
            </button>
          </div>
        );
      })}
    </div>
  );
}
