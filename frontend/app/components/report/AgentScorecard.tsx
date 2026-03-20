import type { AgentScore } from "@/app/types";

export default function AgentScorecard({ score }: { score: AgentScore }) {
  const pct = (score.score / 10) * 100;
  const color =
    score.score >= 7 ? "bg-green-500" : score.score >= 4 ? "bg-amber-500" : "bg-red-500";

  return (
    <div className="border border-border rounded-lg bg-card p-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="font-semibold text-sm">{score.name}</div>
          <div className="text-xs text-text-secondary font-mono">{score.role}</div>
        </div>
        <div className="text-right">
          <div className="text-xl font-bold">{score.score}</div>
          <div className="text-[10px] text-text-tertiary">/10</div>
        </div>
      </div>
      <div className="h-1.5 bg-gray-100 rounded-full mb-3">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      {score.strengths.length > 0 && (
        <div className="mb-2">
          <div className="text-[10px] font-semibold text-green-700 uppercase mb-1">Strengths</div>
          <ul className="text-xs text-text-secondary space-y-0.5">
            {score.strengths.map((s, i) => (
              <li key={i}>+ {s}</li>
            ))}
          </ul>
        </div>
      )}
      {score.weaknesses.length > 0 && (
        <div className="mb-2">
          <div className="text-[10px] font-semibold text-red-700 uppercase mb-1">Weaknesses</div>
          <ul className="text-xs text-text-secondary space-y-0.5">
            {score.weaknesses.map((w, i) => (
              <li key={i}>- {w}</li>
            ))}
          </ul>
        </div>
      )}
      <div className="text-[10px] text-text-tertiary mt-2">
        {Object.entries(score.worldBreakdown).map(([world, count]) => (
          <span key={world} className="mr-3">
            {world}: {count}
          </span>
        ))}
      </div>
    </div>
  );
}
