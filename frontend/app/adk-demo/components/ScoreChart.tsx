// frontend/app/adk-demo/components/ScoreChart.tsx
// No recharts in package.json; using inline SVG polyline chart.
"use client";

type ScoreRow = {
  round: number;
  containment: number;
  evidence: number;
  communication: number;
  business_impact: number;
};

type ScoreChartProps = {
  scores: ScoreRow[];
};

const DIMENSIONS: Array<{ key: keyof Omit<ScoreRow, "round">; label: string; color: string }> = [
  { key: "containment",    label: "Containment",    color: "#2563eb" }, // blue-600
  { key: "evidence",       label: "Evidence",       color: "#16a34a" }, // green-600
  { key: "communication",  label: "Communication",  color: "#9333ea" }, // purple-600
  { key: "business_impact",label: "Business Impact",color: "#ea580c" }, // orange-600
];

const W = 480;
const H = 120;
const PAD_LEFT = 28;
const PAD_RIGHT = 12;
const PAD_TOP = 8;
const PAD_BOTTOM = 20;

function toPoints(scores: ScoreRow[], key: keyof Omit<ScoreRow, "round">): string {
  if (scores.length === 0) return "";
  const xStep = (W - PAD_LEFT - PAD_RIGHT) / Math.max(scores.length - 1, 1);
  return scores
    .map((s, i) => {
      const x = PAD_LEFT + i * xStep;
      const val = Math.min(Math.max(Number(s[key]) || 0, 0), 10);
      const y = PAD_TOP + (H - PAD_TOP - PAD_BOTTOM) * (1 - val / 10);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

function YAxisLabels() {
  return (
    <>
      {[0, 5, 10].map((v) => {
        const y = PAD_TOP + (H - PAD_TOP - PAD_BOTTOM) * (1 - v / 10);
        return (
          <g key={v}>
            <line x1={PAD_LEFT - 4} y1={y} x2={W - PAD_RIGHT} y2={y} stroke="#e5e7eb" strokeWidth={0.5} />
            <text x={PAD_LEFT - 6} y={y + 3} textAnchor="end" fontSize={8} fill="#9ca3af">
              {v}
            </text>
          </g>
        );
      })}
    </>
  );
}

function XAxisLabels({ scores }: { scores: ScoreRow[] }) {
  if (scores.length === 0) return null;
  const xStep = (W - PAD_LEFT - PAD_RIGHT) / Math.max(scores.length - 1, 1);
  return (
    <>
      {scores.map((s, i) => {
        const x = PAD_LEFT + i * xStep;
        return (
          <text key={i} x={x} y={H - 4} textAnchor="middle" fontSize={8} fill="#9ca3af">
            r{s.round}
          </text>
        );
      })}
    </>
  );
}

export default function ScoreChart({ scores }: ScoreChartProps) {
  return (
    <div className="font-mono text-xs bg-gray-50 border border-gray-200 rounded overflow-hidden">
      {/* Header */}
      <div className="bg-gray-100 border-b border-gray-200 px-3 py-1.5 flex items-center gap-3">
        <span className="text-gray-500 uppercase tracking-wider text-xs">score chart</span>
        <span className="text-gray-400">{scores.length} round{scores.length !== 1 ? "s" : ""}</span>
      </div>

      {scores.length === 0 ? (
        <div className="px-3 py-4 text-gray-400 italic text-center">no score data yet</div>
      ) : (
        <>
          {/* SVG chart */}
          <div className="px-3 pt-2">
            <svg
              viewBox={`0 0 ${W} ${H}`}
              width="100%"
              height={H}
              preserveAspectRatio="none"
              aria-label="Score chart"
            >
              <YAxisLabels />
              <XAxisLabels scores={scores} />
              {DIMENSIONS.map((dim) => {
                const pts = toPoints(scores, dim.key);
                return pts ? (
                  <polyline
                    key={dim.key}
                    points={pts}
                    fill="none"
                    stroke={dim.color}
                    strokeWidth={1.5}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                  />
                ) : null;
              })}
              {/* Dots for single-round case */}
              {scores.length === 1 &&
                DIMENSIONS.map((dim) => {
                  const val = Math.min(Math.max(Number(scores[0][dim.key]) || 0, 0), 10);
                  const cy = PAD_TOP + (H - PAD_TOP - PAD_BOTTOM) * (1 - val / 10);
                  return (
                    <circle key={dim.key} cx={PAD_LEFT} cy={cy} r={3} fill={dim.color} />
                  );
                })}
            </svg>
          </div>

          {/* Legend */}
          <div className="px-3 pb-2 flex flex-wrap gap-x-4 gap-y-1">
            {DIMENSIONS.map((dim) => {
              const latest = scores[scores.length - 1];
              const val = Number(latest[dim.key]) || 0;
              return (
                <div key={dim.key} className="flex items-center gap-1">
                  <span
                    className="inline-block w-3 h-0.5 rounded"
                    style={{ backgroundColor: dim.color }}
                  />
                  <span className="text-gray-600">{dim.label}</span>
                  <span className="font-semibold" style={{ color: dim.color }}>
                    {val.toFixed(1)}
                  </span>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
