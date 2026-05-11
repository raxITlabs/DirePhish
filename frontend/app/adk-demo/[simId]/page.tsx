"use client";

import { use, useEffect, useState } from "react";
import { postSmokeRound, openSseStream, type RoundReport, type ActionEventDto } from "@/lib/adk-client";
import PersonaCard from "@/app/adk-demo/components/PersonaCard";
import ActionStream from "@/app/adk-demo/components/ActionStream";
import PressureMeter from "@/app/adk-demo/components/PressureMeter";
import ScoreChart from "@/app/adk-demo/components/ScoreChart";
import CostMeter from "@/app/adk-demo/components/CostMeter";

// Persona agents shown even before any actions arrive
const KNOWN_AGENTS = [
  { name: "CISO", role: "ciso" },
  { name: "IR Lead", role: "ir_lead" },
  { name: "SOC Analyst", role: "soc_analyst" },
  { name: "Legal", role: "legal" },
  { name: "CEO", role: "ceo" },
  { name: "Threat Actor", role: "threat_actor" },
  { name: "Containment Judge", role: "containment_judge" },
];

type PersonaState = {
  name: string;
  role: string;
  latestAction?: { action: string; world: string; preview?: string };
  status: "idle" | "thinking" | "acted";
};

type StreamEvent = {
  type: string;
  round?: number;
  agent?: string;
  world?: string;
  action?: string;
  args?: Record<string, unknown>;
  timestamp?: string;
};

type ScoreRow = {
  round: number;
  containment: number;
  evidence: number;
  communication: number;
  business_impact: number;
};

function actionToStreamEvent(a: ActionEventDto): StreamEvent {
  return {
    type: "action",
    round: a.round,
    agent: a.agent,
    world: a.world,
    action: a.action,
    args: a.args as Record<string, unknown>,
    timestamp: a.timestamp,
  };
}

function buildPersonas(
  knownAgents: typeof KNOWN_AGENTS,
  rounds: RoundReport[]
): PersonaState[] {
  // Collect the last action per agent
  const lastByAgent = new Map<string, ActionEventDto>();
  for (const r of rounds) {
    if (r.adversary_action) {
      lastByAgent.set(r.adversary_action.agent, r.adversary_action);
    }
    for (const d of r.defender_actions) {
      lastByAgent.set(d.agent, d);
    }
  }

  return knownAgents.map(({ name, role }) => {
    const last = lastByAgent.get(role);
    return {
      name,
      role,
      latestAction: last
        ? {
            action: last.action,
            world: last.world,
            preview: last.result
              ? JSON.stringify(last.result).slice(0, 60)
              : undefined,
          }
        : undefined,
      status: last ? "acted" : "idle",
    };
  });
}

function buildScores(rounds: RoundReport[]): ScoreRow[] {
  return rounds
    .map((r, i) => {
      const s = r.judge_score;
      return {
        round: i + 1,
        containment: Number(s.containment ?? s.containment_score ?? 0),
        evidence: Number(s.evidence ?? s.evidence_quality ?? 0),
        communication: Number(s.communication ?? s.communication_score ?? 0),
        business_impact: Number(s.business_impact ?? s.impact_score ?? 0),
      };
    })
    .filter((r) => r.containment + r.evidence + r.communication + r.business_impact > 0);
}

export default function AdkDemoPage({ params }: { params: Promise<{ simId: string }> }) {
  const { simId } = use(params);
  const [rounds, setRounds] = useState<RoundReport[]>([]);
  const [sseEvents, setSseEvents] = useState<StreamEvent[]>([]);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    return openSseStream(simId, (rec) => {
      const ev = rec as StreamEvent;
      setSseEvents((e) => [...e, ev]);
    });
  }, [simId]);

  async function runNext() {
    setRunning(true);
    setError(null);
    try {
      const r = await postSmokeRound(simId, rounds.length + 1, "live");
      setRounds((rs) => [...rs, r]);
    } catch (e: unknown) {
      setError(String(e));
    } finally {
      setRunning(false);
    }
  }

  // Derived state
  const personas = buildPersonas(KNOWN_AGENTS, rounds);

  // Merge SSE events + round action events (newest on top driven by ActionStream)
  const roundActionEvents: StreamEvent[] = rounds.flatMap((r) => [
    ...(r.adversary_action ? [actionToStreamEvent(r.adversary_action)] : []),
    ...r.defender_actions.map(actionToStreamEvent),
  ]);
  const mergedEvents = [...sseEvents, ...roundActionEvents];

  // Latest round pressure events
  const latestPressureEvents =
    rounds.length > 0 ? rounds[rounds.length - 1].pressure_events : [];

  const scores = buildScores(rounds);

  // TODO: totalUsd will read from /api/adk/cost-dashboard/<sim_id> (Track E's endpoint)
  const totalUsd = 0.0;

  return (
    <main className="min-h-screen bg-[#faf9f7] p-6 font-mono">
      {/* Page header */}
      <div className="max-w-7xl mx-auto">
        <div className="flex items-start justify-between mb-6 border-b border-gray-200 pb-4">
          <div>
            <h1 className="text-xl font-bold text-gray-900 tracking-tight">
              ADK War Room
            </h1>
            <p className="text-xs text-gray-500 mt-0.5">
              sim: <span className="text-gray-700">{simId}</span>
              {" · "}
              {rounds.length} round{rounds.length !== 1 ? "s" : ""} completed
              {" · "}
              {sseEvents.length} SSE event{sseEvents.length !== 1 ? "s" : ""}
            </p>
          </div>

          <div className="flex items-center gap-3">
            {error && (
              <span className="text-xs text-red-600 bg-red-50 border border-red-200 px-2 py-1 rounded">
                {error}
              </span>
            )}
            <button
              onClick={runNext}
              disabled={running}
              className="px-4 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
            >
              {running ? "Running…" : `Run Round ${rounds.length + 1}`}
            </button>
          </div>
        </div>

        {/* Top: CostMeter */}
        <div className="mb-4">
          <CostMeter totalUsd={totalUsd} />
        </div>

        {/* Middle row: PersonaCards (left) + PressureMeter (right) */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
          {/* Left: 3-column persona grid (takes 2/3 of space) */}
          <div className="lg:col-span-2">
            <div className="text-xs text-gray-400 uppercase tracking-wider mb-2">agents</div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {personas.map((p) => (
                <PersonaCard
                  key={p.role}
                  name={p.name}
                  role={p.role}
                  latestAction={p.latestAction}
                  status={running && p.status === "idle" ? "thinking" : p.status}
                />
              ))}
            </div>
          </div>

          {/* Right: PressureMeter */}
          <div className="lg:col-span-1">
            <div className="text-xs text-gray-400 uppercase tracking-wider mb-2">
              pressure — round {rounds.length > 0 ? rounds.length : "—"}
            </div>
            <PressureMeter events={latestPressureEvents} />
          </div>
        </div>

        {/* ActionStream */}
        <div className="mb-4">
          <div className="text-xs text-gray-400 uppercase tracking-wider mb-2">event log</div>
          <ActionStream events={mergedEvents} />
        </div>

        {/* ScoreChart — only shown when we have score data */}
        {scores.length > 0 && (
          <div className="mb-4">
            <div className="text-xs text-gray-400 uppercase tracking-wider mb-2">scores over rounds</div>
            <ScoreChart scores={scores} />
          </div>
        )}
      </div>
    </main>
  );
}
