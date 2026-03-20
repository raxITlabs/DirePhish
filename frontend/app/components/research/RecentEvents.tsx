// frontend/app/components/research/RecentEvents.tsx
"use client";

import type { EventInfo } from "@/app/types";

interface Props {
  recentEvents: EventInfo[];
  onChange: (recentEvents: EventInfo[]) => void;
}

const EMPTY_EVENT: EventInfo = { date: "", description: "", source: "" };

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
        <p className="text-sm text-text-secondary">No recent events.</p>
      )}
      {recentEvents.map((event, i) => (
        <div key={i} className="flex gap-2 items-start">
          <input
            type="date"
            value={event.date}
            onChange={(e) => updateEvent(i, "date", e.target.value)}
            className="border border-border rounded-md px-2 py-1.5 text-xs bg-background focus:outline-none focus:border-accent w-36 shrink-0"
          />
          <input
            type="text"
            value={event.description}
            onChange={(e) => updateEvent(i, "description", e.target.value)}
            placeholder="Event description"
            className="flex-1 border border-border rounded-md px-2 py-1.5 text-xs bg-background focus:outline-none focus:border-accent"
          />
          <input
            type="text"
            value={event.source}
            onChange={(e) => updateEvent(i, "source", e.target.value)}
            placeholder="Source"
            className="border border-border rounded-md px-2 py-1.5 text-xs bg-background focus:outline-none focus:border-accent w-28 shrink-0"
          />
          <button
            onClick={() => removeEvent(i)}
            className="text-text-tertiary hover:text-severity-critical-text text-xs px-1.5 py-1.5 rounded hover:bg-severity-critical-bg transition-colors shrink-0"
          >
            ×
          </button>
        </div>
      ))}
      <button
        onClick={addEvent}
        className="text-xs px-3 py-1.5 border border-dashed border-border rounded-md hover:bg-background transition-colors text-text-secondary hover:text-foreground"
      >
        + Add Event
      </button>
    </div>
  );
}
