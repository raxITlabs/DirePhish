"use client";

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
  "bg-royal-azure-100 border-royal-azure-300 text-royal-azure-800",
  "bg-royal-azure-100 border-royal-azure-300 text-royal-azure-800",
  "bg-tuscan-sun-100 border-tuscan-sun-300 text-tuscan-sun-800",
  "bg-tuscan-sun-100 border-tuscan-sun-300 text-tuscan-sun-800",
  "bg-burnt-peach-100 border-burnt-peach-300 text-burnt-peach-800",
  "bg-burnt-peach-100 border-burnt-peach-300 text-burnt-peach-800",
  "bg-burnt-peach-100 border-burnt-peach-300 text-burnt-peach-800",
];

export default function KillChainFlow({ killChain, threatName }: KillChainFlowProps) {
  if (!killChain || killChain.length === 0) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <p className="text-sm font-medium text-pitch-black-600">MITRE ATT&CK Kill Chain</p>
        {threatName && (
          <span className="text-xs text-pitch-black-400">— {threatName}</span>
        )}
      </div>

      {/* Horizontal flow */}
      <div className="flex items-stretch gap-0 overflow-x-auto pb-2">
        {killChain.map((step, i) => (
          <div key={step.step} className="flex items-stretch shrink-0">
            {/* Step card */}
            <div
              className={`relative px-4 py-3 rounded-lg border min-w-[140px] max-w-[180px] ${STEP_COLORS[i % STEP_COLORS.length]}`}
            >
              <p className="text-[10px] uppercase tracking-wider opacity-70 mb-0.5">
                {formatTactic(step.tactic)}
              </p>
              <p className="text-xs font-semibold leading-tight">
                {step.technique}
              </p>
              <p className="text-[10px] opacity-70 mt-1 truncate">
                {step.target}
              </p>
            </div>

            {/* Arrow connector */}
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
