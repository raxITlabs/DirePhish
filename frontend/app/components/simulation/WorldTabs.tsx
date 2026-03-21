"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/app/components/ui/tabs";
import type { AgentAction, ScheduledEvent } from "@/app/types";
import SlackWorld from "./SlackWorld";
import EmailWorld from "./EmailWorld";
import TimelineView from "./TimelineView";
import AgentSummary from "./AgentSummary";

interface Props {
  actions: AgentAction[];
  scheduledEvents: ScheduledEvent[];
}

export default function WorldTabs({ actions, scheduledEvents }: Props) {
  return (
    <Tabs defaultValue="slack" className="flex flex-col h-full">
      <TabsList className="w-full justify-start rounded-none border-b border-border bg-transparent px-2">
        <TabsTrigger value="slack">Slack</TabsTrigger>
        <TabsTrigger value="email">Email</TabsTrigger>
        <TabsTrigger value="timeline">Timeline</TabsTrigger>
        <TabsTrigger value="agents">Agents</TabsTrigger>
      </TabsList>
      <TabsContent value="slack" className="flex-1 min-h-0 overflow-y-auto mt-0">
        <SlackWorld actions={actions} scheduledEvents={scheduledEvents} />
      </TabsContent>
      <TabsContent value="email" className="flex-1 min-h-0 overflow-y-auto mt-0">
        <EmailWorld actions={actions} />
      </TabsContent>
      <TabsContent value="timeline" className="flex-1 min-h-0 overflow-y-auto mt-0">
        <TimelineView actions={actions} scheduledEvents={scheduledEvents} />
      </TabsContent>
      <TabsContent value="agents" className="flex-1 min-h-0 overflow-y-auto mt-0">
        <AgentSummary actions={actions} />
      </TabsContent>
    </Tabs>
  );
}
