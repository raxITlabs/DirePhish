// frontend/app/adk-demo/components/CostMeter.tsx
"use client";

type CostMeterProps = {
  totalUsd: number;
  perRound?: number[];
};

function formatUsd(val: number, decimals = 4): string {
  return val.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export default function CostMeter({ totalUsd, perRound = [] }: CostMeterProps) {
  const avg =
    perRound.length > 0
      ? perRound.reduce((a, b) => a + b, 0) / perRound.length
      : totalUsd > 0 && perRound.length === 0
      ? null
      : null;

  const maxRound = perRound.length > 0 ? Math.max(...perRound) : 0;

  return (
    <div className="font-mono bg-white border border-gray-200 rounded overflow-hidden">
      {/* Header */}
      <div className="bg-gray-100 border-b border-gray-200 px-3 py-1.5 flex items-center">
        <span className="text-gray-500 uppercase tracking-wider text-xs">cost meter</span>
      </div>

      <div className="px-4 py-3 flex items-baseline gap-4 flex-wrap">
        {/* Big ticker */}
        <div>
          <span className="text-xs text-gray-400 uppercase tracking-wide block mb-0.5">total</span>
          <span className="text-2xl font-bold text-gray-900 tabular-nums">
            {formatUsd(totalUsd)}
          </span>
        </div>

        {/* Avg per round */}
        {avg !== null && (
          <div className="text-sm text-gray-500">
            <span className="block text-xs text-gray-400 uppercase tracking-wide mb-0.5">avg / round</span>
            <span className="tabular-nums">{formatUsd(avg)}</span>
          </div>
        )}

        {/* Round count */}
        {perRound.length > 0 && (
          <div className="text-sm text-gray-500">
            <span className="block text-xs text-gray-400 uppercase tracking-wide mb-0.5">rounds</span>
            <span className="tabular-nums">{perRound.length}</span>
          </div>
        )}
      </div>

      {/* Per-round mini bar chart */}
      {perRound.length > 0 && (
        <div className="px-4 pb-3">
          <div className="text-xs text-gray-400 uppercase tracking-wide mb-1">per-round cost</div>
          <div className="flex items-end gap-0.5 h-8">
            {perRound.map((cost, i) => {
              const heightPct = maxRound > 0 ? (cost / maxRound) * 100 : 0;
              return (
                <div
                  key={i}
                  className="flex-1 bg-blue-500 rounded-t min-h-[2px] transition-all"
                  style={{ height: `${Math.max(heightPct, 2)}%` }}
                  title={`Round ${i + 1}: ${formatUsd(cost)}`}
                />
              );
            })}
          </div>
          <div className="flex justify-between text-gray-400 text-xs mt-0.5">
            <span>r1</span>
            {perRound.length > 1 && <span>r{perRound.length}</span>}
          </div>
        </div>
      )}
    </div>
  );
}
