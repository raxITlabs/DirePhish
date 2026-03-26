"use client";

import { Badge } from "@/app/components/ui/badge";

interface StressTestResult {
  label: string;
  containment_round: number | null;
  detection_round: number | null;
  total_rounds: number;
  compliance_score: number;
  communication_score: number;
}

interface StressTestResultsProps {
  results: StressTestResult[];
  mode?: "compact" | "full";
}

function classifyResult(r: StressTestResult): "pass" | "warn" | "fail" {
  if (r.containment_round === null) return "fail";
  const ratio = r.containment_round / r.total_rounds;
  if (ratio <= 0.5) return "pass";
  return "warn";
}

function formatLabel(label: string): string {
  return label.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

const STATUS_CONFIG = {
  pass: { badge: "bg-verdigris-100 text-verdigris-800 border-verdigris-200", text: "Pass" },
  warn: { badge: "bg-tuscan-sun-100 text-tuscan-sun-800 border-tuscan-sun-200", text: "Warn" },
  fail: { badge: "bg-burnt-peach-100 text-burnt-peach-800 border-burnt-peach-200", text: "Fail" },
};

export default function StressTestResults({ results, mode = "compact" }: StressTestResultsProps) {
  const display = mode === "compact" ? results.slice(0, 4) : results;

  if (display.length === 0) return null;

  return (
    <div className="space-y-3">
      <p className="text-sm font-medium text-pitch-black-600">
        Stress Test {mode === "compact" ? "Highlights" : "Results"}
      </p>

      <div className={mode === "full" ? "space-y-2" : "grid grid-cols-2 gap-2"}>
        {display.map((r) => {
          const status = classifyResult(r);
          const config = STATUS_CONFIG[status];
          return (
            <div
              key={r.label}
              className="flex items-center justify-between p-3 rounded-lg bg-pitch-black-50 border border-pitch-black-100"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-pitch-black-800 truncate">
                  {formatLabel(r.label)}
                </p>
                <p className="text-xs text-pitch-black-500">
                  {r.containment_round !== null
                    ? `Contained at round ${r.containment_round}/${r.total_rounds}`
                    : "Not contained"}
                </p>
              </div>
              <Badge variant="outline" className={`shrink-0 ml-2 ${config.badge}`}>
                {config.text}
              </Badge>
            </div>
          );
        })}
      </div>

      {mode === "compact" && results.length > 4 && (
        <p className="text-xs text-pitch-black-400">
          +{results.length - 4} more mutations in CISO view
        </p>
      )}
    </div>
  );
}
