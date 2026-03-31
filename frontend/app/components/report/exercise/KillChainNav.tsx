"use client";

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
    <div className="rounded-xl bg-card ring-1 ring-foreground/10 p-4">
      <div className="flex items-center gap-2 mb-3">
        <p className="text-sm font-medium text-pitch-black-600">
          MITRE ATT&CK Kill Chain
        </p>
        {threatName && (
          <span className="text-xs text-pitch-black-400">— {threatName}</span>
        )}
      </div>

      <div className="flex items-stretch gap-0 overflow-x-auto pb-1">
        {killChain.map((step, i) => {
          const isActive = i === activeStep;
          const colors = STEP_COLORS[i % STEP_COLORS.length];

          return (
            <div key={step.step} className="flex items-stretch shrink-0">
              <button
                onClick={() => onStepClick(i)}
                className={`relative px-4 py-3 rounded-lg border min-w-[130px] max-w-[180px] text-left transition-all cursor-pointer ${
                  isActive
                    ? `${colors.bg} ${colors.border} ring-2 ring-offset-1 ring-pitch-black-200 shadow-sm`
                    : "bg-pitch-black-50 border-pitch-black-200 hover:border-pitch-black-300 hover:bg-pitch-black-100"
                }`}
              >
                {/* Step number badge */}
                <div
                  className={`absolute -top-2 -left-2 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white shadow-sm ${
                    isActive ? colors.badge : "bg-pitch-black-400"
                  }`}
                >
                  {i + 1}
                </div>

                <p
                  className={`text-[10px] uppercase tracking-wider mb-0.5 ${
                    isActive ? colors.text : "text-pitch-black-500"
                  }`}
                >
                  {step.tactic}
                </p>
                <p
                  className={`text-xs font-semibold leading-tight ${
                    isActive ? "text-pitch-black-800" : "text-pitch-black-600"
                  }`}
                >
                  {step.technique}
                </p>
                <p className="text-[10px] text-pitch-black-400 mt-1 truncate">
                  {step.target}
                </p>
              </button>

              {/* Arrow connector */}
              {i < killChain.length - 1 && (
                <div className="flex items-center px-1">
                  <svg
                    width="20"
                    height="12"
                    viewBox="0 0 20 12"
                    className="text-pitch-black-300"
                  >
                    <line
                      x1="0"
                      y1="6"
                      x2="14"
                      y2="6"
                      stroke="currentColor"
                      strokeWidth="1.5"
                    />
                    <polygon
                      points="14,2 20,6 14,10"
                      fill="currentColor"
                    />
                  </svg>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
