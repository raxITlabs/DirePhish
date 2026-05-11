"use client";

import { use, useEffect, useState } from "react";
import { postSmokeRound, openSseStream, type RoundReport } from "@/lib/adk-client";

export default function AdkDemoPage({ params }: { params: Promise<{ simId: string }> }) {
  const { simId } = use(params);
  const [rounds, setRounds] = useState<RoundReport[]>([]);
  const [events, setEvents] = useState<unknown[]>([]);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    return openSseStream(simId, (rec) => setEvents((e) => [...e, rec]));
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

  return (
    <main className="p-6 max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold">ADK War Room — {simId}</h1>
      <p className="text-sm text-gray-500 mb-4">
        {rounds.length} round{rounds.length !== 1 ? "s" : ""} completed · {events.length} SSE events
      </p>
      <button
        onClick={runNext}
        disabled={running}
        className="px-4 py-2 bg-blue-600 text-white rounded disabled:bg-gray-400"
      >
        {running ? "Running…" : `Run Round ${rounds.length + 1}`}
      </button>
      {error && <p className="mt-2 text-red-600 text-sm">{error}</p>}
      <pre className="mt-4 text-xs bg-gray-50 p-3 rounded overflow-auto max-h-96">
        {JSON.stringify({ rounds, events: events.slice(-10) }, null, 2)}
      </pre>
    </main>
  );
}
