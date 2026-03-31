"use client";

interface Props {
  score: number;
  description: string;
  fairIncrement: string;
  isInferred?: boolean;
}

export default function StepRiskMini({ score, description, fairIncrement, isInferred }: Props) {
  // Normalize: scores may be 0-10 or 0-100 scale
  const normalizedScore = score <= 10 ? score * 10 : score;
  const ringColor =
    normalizedScore < 40
      ? "border-verdigris-400 text-verdigris-600"
      : normalizedScore < 70
        ? "border-tuscan-sun-400 text-tuscan-sun-600"
        : "border-burnt-peach-400 text-burnt-peach-600";

  return (
    <div className="flex items-center gap-4 p-4 rounded-xl bg-card ring-1 ring-foreground/10">
      <div
        className={`w-12 h-12 rounded-full border-[3px] flex items-center justify-center text-base font-bold shrink-0 ${ringColor}`}
      >
        {score % 1 === 0 ? score : score.toFixed(1)}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-pitch-black-400 mb-0.5">
          Risk at this phase
          {isInferred && (
            <span className="ml-1 text-pitch-black-300">~estimated</span>
          )}
        </p>
        <p className="text-sm text-pitch-black-700 leading-snug">
          {description}
        </p>
        {fairIncrement && fairIncrement !== "N/A" && (
          <p className="text-xs text-pitch-black-400 mt-1">
            FAIR: {fairIncrement}
          </p>
        )}
      </div>
    </div>
  );
}
