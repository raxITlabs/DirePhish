"use client";

const DIMENSION_LABELS: Record<string, string> = {
  responseSpeed: "Response\nSpeed",
  containmentEffectiveness: "Contain-\nment",
  communicationQuality: "Communi-\ncation",
  complianceAdherence: "Compli-\nance",
  leadershipDecisiveness: "Leader-\nship",
};

const DIMENSIONS = [
  "responseSpeed",
  "containmentEffectiveness",
  "communicationQuality",
  "complianceAdherence",
  "leadershipDecisiveness",
];

interface HeatmapDatum {
  scenario: string;
  dimension: string;
  score: number;
}

function scoreColor(score: number): string {
  if (score >= 7) return "bg-verdigris-500";
  if (score >= 4) return "bg-tuscan-sun-500";
  return "bg-burnt-peach-500";
}

function scoreBorder(score: number): string {
  if (score >= 7) return "ring-verdigris-600/20";
  if (score >= 4) return "ring-tuscan-sun-600/20";
  return "ring-burnt-peach-600/20";
}

export default function HeatmapChart({ data }: { data: HeatmapDatum[] }) {
  const scenarios = Array.from(new Set(data.map((d) => d.scenario)));

  const scoreMap = new Map<string, number>();
  for (const d of data) {
    scoreMap.set(`${d.scenario}::${d.dimension}`, d.score);
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr>
            <th className="text-left text-xs font-medium text-muted-foreground p-2 min-w-[200px]">
              Scenario
            </th>
            {DIMENSIONS.map((dim) => (
              <th
                key={dim}
                className="text-center text-xs font-medium text-muted-foreground p-2 w-20"
              >
                {DIMENSION_LABELS[dim]?.split("\n").map((line, i) => (
                  <span key={i}>
                    {i > 0 && <br />}
                    {line}
                  </span>
                ))}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {scenarios.map((scenario) => (
            <tr key={scenario} className="border-t border-border/50">
              <td className="text-sm font-medium p-2 pr-4">
                {scenario}
              </td>
              {DIMENSIONS.map((dim) => {
                const score = scoreMap.get(`${scenario}::${dim}`) ?? 0;
                return (
                  <td key={dim} className="p-1.5 text-center">
                    <div
                      className={`inline-flex items-center justify-center w-12 h-12 rounded-lg ${scoreColor(score)} ring-1 ${scoreBorder(score)} text-white font-bold text-base`}
                    >
                      {score}
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
