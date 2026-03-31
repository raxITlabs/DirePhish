"use client";

interface Props {
  items: Array<{ time: string; action: string }>;
}

export default function RegulatoryTimeline({ items }: Props) {
  if (items.length === 0) return null;

  return (
    <div className="relative pl-4">
      {/* Vertical line */}
      <div className="absolute left-0 top-0 bottom-0 w-px bg-pitch-black-200" />

      <div className="space-y-4">
        {items.map((item, i) => (
          <div key={i} className="relative">
            {/* Dot on the line */}
            <div className="absolute -left-4 top-1 h-2 w-2 rounded-full bg-tuscan-sun-500 ring-2 ring-pitch-black-100" />

            <p className="text-sm font-semibold text-tuscan-sun-600">
              {item.time}
            </p>
            <p className="text-sm text-pitch-black-600">{item.action}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
