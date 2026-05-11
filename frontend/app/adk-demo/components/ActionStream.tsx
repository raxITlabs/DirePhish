// frontend/app/adk-demo/components/ActionStream.tsx
"use client";

type StreamEvent = {
  type: string;
  round?: number;
  agent?: string;
  world?: string;
  action?: string;
  args?: Record<string, unknown>;
  timestamp?: string;
};

type ActionStreamProps = {
  events: StreamEvent[];
};

function formatArgs(args: Record<string, unknown> | undefined): string {
  if (!args || Object.keys(args).length === 0) return "()";
  const entries = Object.entries(args)
    .slice(0, 3)
    .map(([k, v]) => {
      const val = typeof v === "string" ? v.slice(0, 40) : JSON.stringify(v)?.slice(0, 40) ?? "";
      return `${k}=${val}`;
    });
  const suffix = Object.keys(args).length > 3 ? ", …" : "";
  return `(${entries.join(", ")}${suffix})`;
}

function formatTime(ts: string | undefined): string {
  if (!ts) return "--:--:--";
  try {
    return new Date(ts).toISOString().slice(11, 19);
  } catch {
    return ts.slice(0, 8);
  }
}

const agentColorMap: Record<string, string> = {
  threat_actor: "text-red-600",
  containment_judge: "text-purple-600",
  ciso: "text-blue-700",
  ir_lead: "text-blue-600",
  soc_analyst: "text-blue-500",
  legal: "text-indigo-600",
  ceo: "text-gray-700",
};

function agentColor(agent: string | undefined): string {
  if (!agent) return "text-gray-500";
  return agentColorMap[agent] ?? "text-gray-700";
}

export default function ActionStream({ events }: ActionStreamProps) {
  // Reverse so newest is on top
  const reversed = [...events].reverse();

  // Group by round for header labels
  let lastRound: number | undefined = undefined;

  return (
    <div className="font-mono text-xs bg-gray-50 border border-gray-200 rounded overflow-hidden">
      {/* Header */}
      <div className="bg-gray-100 border-b border-gray-200 px-3 py-1.5 flex items-center gap-2">
        <span className="text-gray-500 uppercase tracking-wider text-xs">action stream</span>
        <span className="ml-auto text-gray-400">{events.length} events</span>
      </div>

      {/* Scrollable event list */}
      <div className="overflow-y-auto max-h-72">
        {reversed.length === 0 ? (
          <div className="px-3 py-4 text-gray-400 italic text-center">no events yet</div>
        ) : (
          reversed.map((ev, idx) => {
            const isNewRound = ev.round !== undefined && ev.round !== lastRound;
            if (ev.round !== undefined) lastRound = ev.round;

            return (
              <div key={idx}>
                {isNewRound && (
                  <div className="px-3 py-0.5 bg-gray-100 border-y border-gray-200 text-gray-500 uppercase text-xs tracking-widest">
                    — Round {ev.round} —
                  </div>
                )}
                <div className="flex items-start gap-2 px-3 py-1.5 border-b border-gray-100 hover:bg-white transition-colors">
                  {/* Timestamp */}
                  <span className="text-gray-400 flex-shrink-0 w-16">{formatTime(ev.timestamp)}</span>

                  {/* Round badge (for non-grouped view) */}
                  {ev.round !== undefined && (
                    <span className="flex-shrink-0 px-1 rounded bg-gray-200 text-gray-600 text-xs">
                      r{ev.round}
                    </span>
                  )}

                  {/* Agent */}
                  <span className={`flex-shrink-0 w-24 truncate font-semibold ${agentColor(ev.agent)}`}>
                    {ev.agent ?? ev.type}
                  </span>

                  {/* Action + args */}
                  <span className="text-gray-700 truncate">
                    {ev.action ?? ev.type}
                    <span className="text-gray-400">{formatArgs(ev.args)}</span>
                  </span>

                  {/* World tag */}
                  {ev.world && (
                    <span className="ml-auto flex-shrink-0 text-gray-400 italic">[{ev.world}]</span>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
