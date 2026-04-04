"use client";

import { Card } from "@/app/components/ui/card";

function formatTactic(t: string): string {
  return t.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

interface KillChainStep {
  step: number;
  tactic: string;
  technique: string;
  target: string;
  description: string;
}

interface KillChainFlowProps {
  killChain: KillChainStep[];
  threatName?: string;
}

const STEP_TEXT_COLORS = [
  "text-royal-azure-800",
  "text-royal-azure-800",
  "text-tuscan-sun-800",
  "text-tuscan-sun-800",
  "text-burnt-peach-800",
  "text-burnt-peach-800",
  "text-burnt-peach-800",
];

export default function KillChainFlow({ killChain, threatName }: KillChainFlowProps) {
  if (!killChain || killChain.length === 0) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-primary font-mono text-xs select-none" aria-hidden="true">{"⚔"}</span>
        <p className="font-mono text-xs font-semibold uppercase tracking-wider text-foreground">MITRE ATT&CK Kill Chain</p>
        {threatName && (
          <span className="text-xs font-mono text-muted-foreground">— {threatName}</span>
        )}
      </div>

      <div className="flex items-stretch gap-0 overflow-x-auto pb-2">
        {killChain.map((step, i) => (
          <div key={step.step} className="flex items-stretch shrink-0">
            <Card size="sm" className={`min-w-[140px] max-w-[180px] ${STEP_TEXT_COLORS[i % STEP_TEXT_COLORS.length]}`}>
              <p className="text-[10px] uppercase tracking-wider opacity-70 mb-0.5">
                {formatTactic(step.tactic)}
              </p>
              <p className="text-xs font-semibold leading-tight">
                {step.technique}
              </p>
              <p className="text-[10px] opacity-70 mt-1 truncate">
                {step.target}
              </p>
            </Card>

            {i < killChain.length - 1 && (
              <div className="flex items-center px-1">
                <svg width="20" height="12" viewBox="0 0 20 12" className="text-pitch-black-300">
                  <line x1="0" y1="6" x2="14" y2="6" stroke="currentColor" strokeWidth="1.5" />
                  <polygon points="14,2 20,6 14,10" fill="currentColor" />
                </svg>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
