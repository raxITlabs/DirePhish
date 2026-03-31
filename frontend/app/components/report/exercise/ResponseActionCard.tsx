"use client";

import type { ResponseAction } from "@/app/actions/report";

interface Props {
  action: ResponseAction;
  index: number;
}

const priorityStyles: Record<string, string> = {
  critical: "bg-burnt-peach-500 text-white",
  high: "bg-tuscan-sun-500 text-white",
  medium: "bg-royal-azure-500 text-white",
};

export default function ResponseActionCard({ action, index }: Props) {
  return (
    <div className="p-4 rounded-xl bg-card ring-1 ring-foreground/10">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-start gap-3">
          <span className="w-6 h-6 rounded-full bg-pitch-black-200 flex items-center justify-center text-xs font-bold text-pitch-black-600 shrink-0 mt-0.5">
            {index + 1}
          </span>
          <h4 className="text-sm font-semibold text-pitch-black-800 leading-snug">
            {action.title}
          </h4>
        </div>
        <span
          className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full shrink-0 ${
            priorityStyles[action.priority] ?? priorityStyles.medium
          }`}
        >
          {action.priority}
        </span>
      </div>

      {/* Description */}
      <p className="text-sm text-pitch-black-600 leading-relaxed mb-3 pl-9">
        {action.description}
      </p>

      {/* Commands */}
      {action.commands.length > 0 && (
        <div className="space-y-1.5 mb-3 pl-9">
          {action.commands.map((cmd, i) => (
            <pre
              key={i}
              className="text-xs font-mono bg-pitch-black-100 border border-pitch-black-200 rounded-lg px-3 py-2 overflow-x-auto text-pitch-black-700 whitespace-pre-wrap"
            >
              {cmd}
            </pre>
          ))}
        </div>
      )}

      {/* Meta */}
      <div className="text-xs text-pitch-black-400 pl-9 pt-2 border-t border-pitch-black-100">
        <span className="text-pitch-black-600 font-medium">{action.owner}</span>
        <span className="mx-1.5">·</span>
        <span>{action.sla}</span>
      </div>
    </div>
  );
}
