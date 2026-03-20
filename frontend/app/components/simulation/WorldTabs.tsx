"use client";

import { useState } from "react";
import type { AgentAction, ScheduledEvent } from "@/app/types";
import SlackWorld from "./SlackWorld";
import EmailWorld from "./EmailWorld";
import TimelineView from "./TimelineView";

const TABS = ["Slack", "Email", "Timeline"] as const;
type Tab = (typeof TABS)[number];

interface Props {
  actions: AgentAction[];
  scheduledEvents: ScheduledEvent[];
}

export default function WorldTabs({ actions, scheduledEvents }: Props) {
  const [tab, setTab] = useState<Tab>("Slack");

  return (
    <div className="flex flex-col h-full">
      <div className="flex border-b-2 border-border">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm transition-colors ${
              tab === t
                ? "border-b-2 border-accent text-accent font-medium -mb-[2px]"
                : "text-text-secondary hover:text-foreground"
            }`}
          >
            {t}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-hidden">
        {tab === "Slack" && <SlackWorld actions={actions} scheduledEvents={scheduledEvents} />}
        {tab === "Email" && <EmailWorld actions={actions} />}
        {tab === "Timeline" && <TimelineView actions={actions} scheduledEvents={scheduledEvents} />}
      </div>
    </div>
  );
}
