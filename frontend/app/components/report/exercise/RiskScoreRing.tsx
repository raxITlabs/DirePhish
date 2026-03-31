"use client";

interface Props {
  score: number;
  ci: { lower: number; upper: number };
  interpretation: { tier: string; label: string; description: string };
}

function scoreColor(score: number): string {
  if (score >= 70) return "text-verdigris-500";
  if (score >= 40) return "text-tuscan-sun-500";
  return "text-burnt-peach-500";
}

function strokeColor(score: number): string {
  if (score >= 70) return "stroke-verdigris-500";
  if (score >= 40) return "stroke-tuscan-sun-500";
  return "stroke-burnt-peach-500";
}

function tierBgColor(tier: string): string {
  if (tier === "excellent" || tier === "good") return "bg-verdigris-50 text-verdigris-700 ring-1 ring-verdigris-200";
  if (tier === "moderate") return "bg-tuscan-sun-50 text-tuscan-sun-700 ring-1 ring-tuscan-sun-200";
  return "bg-burnt-peach-50 text-burnt-peach-700 ring-1 ring-burnt-peach-200";
}

export default function RiskScoreRing({ score, ci, interpretation }: Props) {
  const radius = 56;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;

  return (
    <div className="bg-card rounded-xl p-6 text-center ring-1 ring-foreground/10">
      <div className="relative w-[160px] h-[160px] mx-auto mb-4">
        <svg viewBox="0 0 140 140" className="w-full h-full">
          <circle cx="70" cy="70" r={radius} fill="none" stroke="currentColor" strokeWidth="10" className="text-pitch-black-200" />
          <circle
            cx="70" cy="70" r={radius} fill="none" strokeWidth="10" strokeLinecap="round"
            strokeDasharray={circumference} strokeDashoffset={offset}
            className={`${strokeColor(score)} -rotate-90 origin-center transition-all duration-700`}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={`text-4xl font-bold ${scoreColor(score)}`}>{Math.round(score)}</span>
          <span className="text-[11px] text-pitch-black-500">/100</span>
        </div>
      </div>
      <p className="text-sm font-medium text-pitch-black-700">DirePhish Risk Score</p>
      <div className={`inline-block mt-2 px-3 py-1 rounded-full text-xs font-semibold ${tierBgColor(interpretation.tier)}`}>
        {interpretation.label}
      </div>
      <p className="text-[11px] text-pitch-black-500 mt-1">{interpretation.description}</p>
      <div className="mt-3 inline-block px-3 py-1 bg-pitch-black-200 rounded-full text-[11px] text-pitch-black-500">
        95% CI: {ci.lower.toFixed(0)} — {ci.upper.toFixed(0)}
      </div>
    </div>
  );
}
