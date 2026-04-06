"use client";

import type { ResponseAction } from "@/app/actions/report";
import { Badge } from "@/app/components/ui/badge";

interface Props {
  action: ResponseAction;
  index: number;
}

const priorityVariant: Record<string, "destructive" | "warning" | "default"> = {
  critical: "destructive",
  high: "warning",
  medium: "default",
};

export default function ResponseActionCard({ action, index }: Props) {
  return (
    <div className="py-2.5 border-b border-border/10 last:border-b-0">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2.5">
          <span className="w-5 h-5 rounded-full bg-muted flex items-center justify-center text-[10px] font-bold text-foreground/60 shrink-0 mt-0.5">
            {index + 1}
          </span>
          <h4 className="text-sm font-semibold text-foreground leading-snug">
            {action.title}
          </h4>
        </div>
        <Badge
          variant={priorityVariant[action.priority] ?? "default"}
          className="text-[9px] uppercase tracking-wider shrink-0"
        >
          {action.priority}
        </Badge>
      </div>

      {/* Description */}
      <p className="text-xs text-foreground/70 leading-relaxed mt-1 pl-[30px]">
        {action.description}
      </p>

      {/* Commands */}
      {action.commands.length > 0 && (
        <div className="space-y-1 mt-1 pl-[30px]">
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
      <div className="text-[10px] text-muted-foreground pl-[30px] pt-1.5 border-t border-border/20 mt-1">
        <span className="text-foreground/60 font-medium">{action.owner}</span>
        <span className="mx-1.5 text-border">·</span>
        <span>{action.sla}</span>
      </div>
    </div>
  );
}
