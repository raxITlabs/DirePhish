// frontend/app/components/research/RecentEvents.tsx
"use client";

import type { EventInfo } from "@/app/types";
import { Input } from "@/app/components/ui/input";
import { Button } from "@/app/components/ui/button";

interface Props {
  recentEvents: EventInfo[];
  onChange: (recentEvents: EventInfo[]) => void;
}

const EMPTY_EVENT: EventInfo = { date: "", description: "", source: "" };

const EVENT_CATEGORIES: NonNullable<EventInfo["category"]>[] = [
  "breach",
  "acquisition",
  "leadership_change",
  "regulatory",
  "product_launch",
  "layoff",
  "other",
];

export default function RecentEvents({ recentEvents, onChange }: Props) {
  const updateEvent = (
    index: number,
    field: keyof EventInfo,
    value: string
  ) => {
    const updated = recentEvents.map((e, i) =>
      i === index ? { ...e, [field]: value } : e
    );
    onChange(updated);
  };

  const addEvent = () => {
    onChange([...recentEvents, { ...EMPTY_EVENT }]);
  };

  const removeEvent = (index: number) => {
    onChange(recentEvents.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-2">
      {recentEvents.length === 0 && (
        <p className="text-sm text-muted-foreground">No recent events.</p>
      )}
      {recentEvents.map((event, i) => (
        <div key={i} className="space-y-1">
          <div className="flex gap-2 items-start">
            <Input
              type="date"
              value={event.date}
              onChange={(e) => updateEvent(i, "date", e.target.value)}
              className="text-xs w-36 shrink-0"
            />
            <select
              value={event.category ?? "other"}
              onChange={(e) => updateEvent(i, "category", e.target.value)}
              className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 shrink-0"
            >
              {EVENT_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c.replace("_", " ")}
                </option>
              ))}
            </select>
            <Input
              type="text"
              value={event.description}
              onChange={(e) => updateEvent(i, "description", e.target.value)}
              placeholder="Event description"
              className="flex-1 text-xs"
            />
            <Input
              type="text"
              value={event.source}
              onChange={(e) => updateEvent(i, "source", e.target.value)}
              placeholder="Source"
              className="text-xs w-24 shrink-0"
            />
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={() => removeEvent(i)}
              className="text-muted-foreground hover:text-destructive shrink-0"
            >
              x
            </Button>
          </div>
          <Input
            type="text"
            value={event.impact ?? ""}
            onChange={(e) => updateEvent(i, "impact", e.target.value)}
            placeholder="Impact (e.g. $2M remediation, 100K records exposed)"
            className="text-xs text-muted-foreground"
          />
        </div>
      ))}
      <Button variant="outline" size="sm" onClick={addEvent} className="border-dashed">
        + Add Event
      </Button>
    </div>
  );
}
