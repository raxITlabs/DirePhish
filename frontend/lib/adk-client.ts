// frontend/lib/adk-client.ts
export type RoundReport = {
  simulation_id: string;
  round: number;
  mode: string;
  phases: string[];
  pressure_events: Array<{kind: string; target: string; payload: Record<string, unknown>; round: number}>;
  adversary_action: ActionEventDto | null;
  defender_actions: ActionEventDto[];
  judge_score: Record<string, number | string>;
};

export type ActionEventDto = {
  round: number;
  timestamp: string;
  simulation_id: string;
  agent: string;
  role: string;
  world: string;
  action: string;
  args: Record<string, unknown>;
  result: Record<string, unknown> | null;
};

const API_BASE = (typeof window !== "undefined"
  ? (process.env.NEXT_PUBLIC_API_URL ?? `${window.location.protocol}//api.${window.location.hostname}:${window.location.port}`)
  : "https://api.direphish.localhost:1355");

export async function postSmokeRound(simId: string, roundNum: number, mode: "live" | "fake" = "live"): Promise<RoundReport> {
  const r = await fetch(`${API_BASE}/api/adk/smoke`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ simulation_id: simId, round_num: roundNum, mode }),
  });
  if (!r.ok) throw new Error(`smoke failed: ${r.status} ${await r.text()}`);
  return r.json();
}

export function openSseStream(simId: string, onMessage: (record: unknown) => void): () => void {
  const es = new EventSource(`${API_BASE}/api/adk/sse/${simId}`);
  es.onmessage = (e) => {
    try {
      onMessage(JSON.parse(e.data));
    } catch (err) {
      console.warn("SSE parse error", err, e.data);
    }
  };
  es.onerror = (e) => console.warn("SSE error", e);
  return () => es.close();
}
