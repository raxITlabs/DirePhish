"use client";

import { Card } from "@/app/components/ui/card";

const cornerMark = "absolute font-mono text-[10px] text-muted-foreground/30 select-none leading-none pointer-events-none";

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

interface KillChainNavProps {
  killChain: KillChainStep[];
  activeStep: number;
  onStepClick: (index: number) => void;
  threatName?: string;
}

// Match the existing KillChainFlow.tsx color cycling
const STEP_COLORS = [
  { bg: "bg-royal-azure-50", border: "border-royal-azure-200", text: "text-royal-azure-700", badge: "bg-royal-azure-500" },
  { bg: "bg-royal-azure-50", border: "border-royal-azure-200", text: "text-royal-azure-700", badge: "bg-royal-azure-500" },
  { bg: "bg-tuscan-sun-50", border: "border-tuscan-sun-200", text: "text-tuscan-sun-700", badge: "bg-tuscan-sun-500" },
  { bg: "bg-tuscan-sun-50", border: "border-tuscan-sun-200", text: "text-tuscan-sun-700", badge: "bg-tuscan-sun-500" },
  { bg: "bg-burnt-peach-50", border: "border-burnt-peach-200", text: "text-burnt-peach-700", badge: "bg-burnt-peach-500" },
  { bg: "bg-burnt-peach-50", border: "border-burnt-peach-200", text: "text-burnt-peach-700", badge: "bg-burnt-peach-500" },
  { bg: "bg-burnt-peach-50", border: "border-burnt-peach-200", text: "text-burnt-peach-700", badge: "bg-burnt-peach-500" },
];

export default function KillChainNav({
  killChain,
  activeStep,
  onStepClick,
  threatName,
}: KillChainNavProps) {
  if (!killChain || killChain.length === 0) return null;

  return (
    <Card className="p-3">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-primary font-mono text-xs select-none" aria-hidden="true">{"⚔"}</span>
        <p className="font-mono text-xs font-semibold uppercase tracking-wider text-foreground">
          MITRE ATT&CK Kill Chain
        </p>
        {threatName && (
          <span className="text-xs font-mono text-muted-foreground">— {threatName}</span>
        )}
      </div>

      <div className="flex items-stretch gap-0">
        {killChain.map((step, i) => {
          const isActive = i === activeStep;
          const colors = STEP_COLORS[i % STEP_COLORS.length];

          return (
            <div key={step.step} className="flex items-stretch flex-1 min-w-0">
              <div className="relative p-0.5 flex-1 min-w-0">
                <span className={`${cornerMark} -top-1 -left-0.5 ${isActive ? "text-muted-foreground/70" : ""}`} aria-hidden="true">┌</span>
                <span className={`${cornerMark} -top-1 -right-0.5 ${isActive ? "text-muted-foreground/70" : ""}`} aria-hidden="true">┐</span>
                <span className={`${cornerMark} -bottom-1 -left-0.5 ${isActive ? "text-muted-foreground/70" : ""}`} aria-hidden="true">└</span>
                <span className={`${cornerMark} -bottom-1 -right-0.5 ${isActive ? "text-muted-foreground/70" : ""}`} aria-hidden="true">┘</span>
                <button
                  onClick={() => onStepClick(i)}
                  className={`flex items-start gap-2 px-2.5 py-2 rounded-lg border w-full text-left transition-all cursor-pointer ${
                    isActive
                      ? `${colors.bg} ${colors.border} shadow-sm`
                      : "bg-pitch-black-50 border-pitch-black-200 hover:border-pitch-black-300 hover:bg-pitch-black-100"
                  }`}
                >
                {/* Step number badge — inline, always visible */}
                <span
                  className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0 mt-0.5 ${
                    isActive ? colors.badge : "bg-pitch-black-400"
                  }`}
                >
                  {i + 1}
                </span>

                <div className="min-w-0">
                  <p
                    className={`text-[10px] uppercase tracking-wider mb-0.5 ${
                      isActive ? colors.text : "text-pitch-black-500"
                    }`}
                  >
                    {formatTactic(step.tactic)}
                  </p>
                  <p
                    className={`text-xs font-semibold leading-tight ${
                      isActive ? "text-pitch-black-800" : "text-pitch-black-600"
                    }`}
                  >
                    {step.technique}
                  </p>
                  <p className="text-[10px] text-pitch-black-400 mt-0.5 truncate">
                    {step.target}
                  </p>
                </div>
              </button>
              </div>

              {/* Arrow connector */}
              {i < killChain.length - 1 && (
                <div className="flex items-center px-0.5 shrink-0">
                  <span className="text-pitch-black-300 text-xs font-mono select-none" aria-hidden="true">→</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}
