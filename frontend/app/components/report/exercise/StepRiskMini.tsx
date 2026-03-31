"use client";

interface Props {
  score: number;
  description: string;
  fairIncrement: string;
  isInferred?: boolean;
}

function ringColor(score: number): string {
  if (score > 70) return "border-burnt-peach-400 text-burnt-peach-400";
  if (score >= 40) return "border-tuscan-sun-400 text-tuscan-sun-400";
  return "border-verdigris-400 text-verdigris-400";
}

export default function StepRiskMini({
  score,
  description,
  fairIncrement,
  isInferred,
}: Props) {
  return (
    <div className="flex items-center gap-4 rounded-xl border border-pitch-black-200 bg-pitch-black-100 p-3">
      {/* Circular score gauge */}
      <div
        className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full border-[3px] ${ringColor(score)}`}
      >
        <span className="text-sm font-bold">{Math.round(score)}</span>
      </div>

      {/* Right side */}
      <div className="min-w-0 flex-1">
        <p className="text-sm text-pitch-black-700">{description}</p>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-xs text-pitch-black-400">
            FAIR: {fairIncrement}
          </span>
          {isInferred && (
            <span className="text-xs italic text-pitch-black-400">
              ~estimated
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
