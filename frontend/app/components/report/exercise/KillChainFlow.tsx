"use client";

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

interface KillChainFlowProps {
  killChain: KillChainStep[];
  threatName?: string;
}

const STEP_COLORS = [
  { bg: "bg-royal-azure-50", border: "border-royal-azure-200", text: "text-royal-azure-700" },
  { bg: "bg-royal-azure-50", border: "border-royal-azure-200", text: "text-royal-azure-700" },
  { bg: "bg-tuscan-sun-50", border: "border-tuscan-sun-200", text: "text-tuscan-sun-700" },
  { bg: "bg-tuscan-sun-50", border: "border-tuscan-sun-200", text: "text-tuscan-sun-700" },
  { bg: "bg-burnt-peach-50", border: "border-burnt-peach-200", text: "text-burnt-peach-700" },
  { bg: "bg-burnt-peach-50", border: "border-burnt-peach-200", text: "text-burnt-peach-700" },
  { bg: "bg-burnt-peach-50", border: "border-burnt-peach-200", text: "text-burnt-peach-700" },
];

export default function KillChainFlow({ killChain, threatName }: KillChainFlowProps) {
  if (!killChain || killChain.length === 0) return null;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-primary font-mono text-xs select-none" aria-hidden="true">{"⚔"}</span>
        <p className="font-mono text-xs font-semibold uppercase tracking-wider text-foreground">MITRE ATT&CK Kill Chain</p>
        {threatName && (
          <span className="text-xs font-mono text-muted-foreground">— {threatName}</span>
        )}
      </div>

      <div className="flex items-stretch gap-0">
        {killChain.map((step, i) => {
          const colors = STEP_COLORS[i % STEP_COLORS.length];

          return (
            <div key={step.step} className="flex items-stretch flex-1 min-w-0">
              <div className="relative p-0.5 flex-1 min-w-0">
                <span className={`${cornerMark} -top-1 -left-0.5`} aria-hidden="true">┌</span>
                <span className={`${cornerMark} -top-1 -right-0.5`} aria-hidden="true">┐</span>
                <span className={`${cornerMark} -bottom-1 -left-0.5`} aria-hidden="true">└</span>
                <span className={`${cornerMark} -bottom-1 -right-0.5`} aria-hidden="true">┘</span>
                <div
                  className={`px-2.5 py-2 rounded-lg border w-full ${colors.bg} ${colors.border}`}
                >
                  <p className={`text-[10px] uppercase tracking-wider mb-0.5 ${colors.text}`}>
                    {formatTactic(step.tactic)}
                  </p>
                  <p className="text-xs font-semibold leading-tight text-pitch-black-800">
                    {step.technique}
                  </p>
                  <p className="text-[10px] text-pitch-black-400 mt-0.5 truncate">
                    {step.target}
                  </p>
                </div>
              </div>

              {i < killChain.length - 1 && (
                <div className="flex items-center px-0.5 shrink-0">
                  <span className="text-pitch-black-300 text-xs font-mono select-none" aria-hidden="true">→</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
