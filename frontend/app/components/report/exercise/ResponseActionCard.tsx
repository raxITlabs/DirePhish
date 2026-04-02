"use client";

import type { ResponseAction } from "@/app/actions/report";

interface Props {
  action: ResponseAction;
  index: number;
}

const priorityStyles: Record<string, string> = {
  critical: "bg-burnt-peach-500 text-white",
  high: "bg-tuscan-sun-500 text-white",
  medium: "bg-royal-azure-100 text-royal-azure-700",
};

export default function ResponseActionCard({ action, index }: Props) {
  return (
    <div className="p-3 rounded-lg border border-border/40 bg-card">
      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-start gap-2.5">
          <span className="w-5 h-5 rounded-full bg-muted flex items-center justify-center text-[10px] font-bold text-foreground/60 shrink-0 mt-0.5">
            {index + 1}
          </span>
          <h4 className="text-sm font-semibold text-foreground leading-snug">
            {action.title}
          </h4>
        </div>
        <span
          className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md shrink-0 ${
            priorityStyles[action.priority] ?? priorityStyles.medium
          }`}
        >
          {action.priority}
        </span>
      </div>

      {/* Description */}
      <p className="text-xs text-foreground/70 leading-relaxed mb-2 pl-[30px]">
        {action.description}
      </p>

      {/* Commands */}
      {action.commands.length > 0 && (
        <div className="space-y-1 mb-2 pl-[30px]">
          {action.commands.map((cmd, i) => (
            <pre
              key={i}
              className="text-[11px] font-mono bg-muted/50 border border-border/30 rounded-md px-2.5 py-1.5 overflow-x-auto text-foreground/70 whitespace-pre-wrap"
            >
              {cmd}
            </pre>
          ))}
        </div>
      )}

      {/* Meta */}
      <div className="text-[10px] text-muted-foreground pl-[30px] pt-1.5 border-t border-border/20">
        <span className="text-foreground/60 font-medium">{action.owner}</span>
        <span className="mx-1.5 text-border">·</span>
        <span>{action.sla}</span>
      </div>
    </div>
  );
}
