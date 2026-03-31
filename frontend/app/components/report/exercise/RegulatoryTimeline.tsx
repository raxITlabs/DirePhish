"use client";

interface Props {
  items: Array<{ time: string; action: string }>;
}

export default function RegulatoryTimeline({ items }: Props) {
  if (!items || items.length === 0) return null;

  return (
    <div className="space-y-0">
      {items.map((item, i) => (
        <div
          key={i}
          className="flex items-start gap-3 py-2.5 border-l-2 border-pitch-black-100 pl-4 relative"
        >
          <span className="absolute -left-[5px] top-3.5 w-2.5 h-2.5 rounded-full bg-tuscan-sun-500" />
          <span className="text-xs font-semibold text-tuscan-sun-600 shrink-0 w-12">
            {item.time}
          </span>
          <span className="text-xs text-pitch-black-600 leading-relaxed">
            {item.action}
          </span>
        </div>
      ))}
    </div>
  );
}
