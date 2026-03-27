"use client";

interface Props {
  dimensions: {
    detection_speed: number;
    containment_effectiveness: number;
    communication_quality: number;
    decision_consistency: number;
    compliance_adherence: number;
    escalation_resistance: number;
  };
}

const LABELS: Record<string, string> = {
  detection_speed: "Detection Speed",
  containment_effectiveness: "Containment Effectiveness",
  communication_quality: "Communication Quality",
  decision_consistency: "Decision Consistency",
  compliance_adherence: "Compliance Adherence",
  escalation_resistance: "Escalation Resistance",
};

function barColor(score: number): string {
  if (score >= 70) return "bg-verdigris-500";
  if (score >= 40) return "bg-tuscan-sun-500";
  return "bg-burnt-peach-500";
}

function textColor(score: number): string {
  if (score >= 70) return "text-verdigris-500";
  if (score >= 40) return "text-tuscan-sun-500";
  return "text-burnt-peach-500";
}

export default function ScoreDimensions({ dimensions }: Props) {
  const entries = Object.entries(dimensions) as [string, number][];

  return (
    <div className="bg-pitch-black-100 rounded-xl p-5 border border-pitch-black-200">
      <h3 className="text-[11px] font-semibold uppercase tracking-wider text-pitch-black-500 mb-4">
        Score Dimensions
      </h3>
      <div className="space-y-3">
        {entries.map(([key, score]) => (
          <div key={key}>
            <div className="flex justify-between mb-1">
              <span className="text-xs text-pitch-black-400">{LABELS[key] ?? key}</span>
              <span className={`text-xs font-semibold ${textColor(score)}`}>{Math.round(score)}/100</span>
            </div>
            <div className="h-1.5 bg-pitch-black-200 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${barColor(score)}`}
                style={{ width: `${Math.max(1, Math.min(100, score))}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
