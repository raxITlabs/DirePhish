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

// Backend base URL. In prod this is baked at build time via NEXT_PUBLIC_API_URL
// (or NEXT_PUBLIC_FLASK_API_URL). Falls back to localhost for local dev — never
// the old "api.<host>:<port>" guess, which is unresolvable on Cloud Run.
const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ??
  process.env.NEXT_PUBLIC_FLASK_API_URL ??
  "http://localhost:5001";

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
