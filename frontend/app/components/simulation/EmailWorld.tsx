"use client";

import { useState } from "react";
import type { AgentAction } from "@/app/types";
import { Card } from "@/app/components/ui/card";
import { Badge } from "@/app/components/ui/badge";
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
        <p className="text-muted-foreground text-sm text-center py-8">
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
            <Card
              className="mb-2 hover:border-primary/50 transition-colors cursor-pointer px-4 py-3"
              onClick={() => setExpanded(isExpanded ? null : i)}
            >
              <div className="w-full text-left">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-sm font-medium truncate">
                      {action.agent}
                    </span>
                    <Badge variant={action.action === "reply_email" ? "secondary" : "outline"} className="text-[10px]">
                      {action.action === "reply_email" ? "reply" : "email"}
                    </Badge>
                    <span className="text-xs text-muted-foreground">&rarr;</span>
                    <span className="text-xs text-muted-foreground truncate">
                      {(action.args.to as string) || ""}
                    </span>
                  </div>
                  <span className="text-xs text-muted-foreground flex-shrink-0 ml-2">
                    R{action.round}
                  </span>
                </div>
                <div className="text-sm font-medium mt-1 truncate">
                  {(action.args.subject as string) || "(no subject)"}
                </div>
                {isExpanded && (
                  <div className="mt-3 pt-3 border-t border-border text-sm text-muted-foreground whitespace-pre-wrap">
                    {(action.args.body as string) || ""}
                    {(action.args.cc as string | undefined) && (
                      <div className="mt-2 text-xs text-muted-foreground">
                        CC: {action.args.cc as string}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </Card>
          </div>
        );
      })}
    </div>
  );
}
