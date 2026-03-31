"use client";

interface Driver {
  description: string;
  evidence: string;
  impact: number;
  correlation: string;
}

interface Props {
  drivers: Driver[];
}

export default function RiskDrivers({ drivers }: Props) {
  if (!drivers || drivers.length === 0) {
    return (
      <div className="bg-pitch-black-100 rounded-xl p-5 border border-pitch-black-200">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-pitch-black-500 mb-3">
          Top Risk Drivers
        </h3>
        <p className="text-sm text-pitch-black-500">Insufficient data for driver analysis. Run more MC iterations for attribution.</p>
      </div>
    );
  }

  return (
    <div className="bg-pitch-black-100 rounded-xl p-5 border border-pitch-black-200">
      <h3 className="text-[11px] font-semibold uppercase tracking-wider text-pitch-black-500 mb-4">
        Top Risk Drivers — Why This Score
      </h3>
      <div className="space-y-0">
        {drivers.map((driver, i) => (
          <div key={i} className={`flex items-start gap-3 py-3 ${i < drivers.length - 1 ? "border-b border-pitch-black-200" : ""}`}>
            <div className="w-6 h-6 rounded-full bg-burnt-peach-900/30 text-burnt-peach-400 flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">
              {i + 1}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-medium text-pitch-black-300">{driver.description}</p>
              <p className="text-[11px] text-pitch-black-500 mt-0.5">{driver.evidence}</p>
            </div>
            <span className="text-sm font-semibold text-burnt-peach-400 shrink-0">
              {driver.impact > 0 ? "+" : ""}{driver.impact.toFixed(1)} pts
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
