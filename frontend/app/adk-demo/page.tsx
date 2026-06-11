"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * War Room index — entry point to the live ADK simulation view.
 *
 * The war room (/adk-demo/[simId]) is driven by the backend's /api/adk/smoke
 * endpoint, so any simulation id works: start a fresh session or open an
 * existing one. This un-orphans the live ADK view (PersonaCard / ActionStream /
 * PressureMeter / ScoreChart / CostMeter) that was previously URL-only.
 */
export default function AdkDemoIndex() {
  const router = useRouter();
  const [simId, setSimId] = useState("");

  function startNew() {
    const id = `demo-${Date.now()}`;
    router.push(`/adk-demo/${id}`);
  }

  function open() {
    const id = simId.trim();
    if (id) router.push(`/adk-demo/${encodeURIComponent(id)}`);
  }

  return (
    <main className="mx-auto max-w-2xl px-6 py-16 font-mono">
      <h1 className="text-2xl font-semibold tracking-tight">War Room — ADK Live</h1>
      <p className="mt-3 text-sm text-muted-foreground">
        Watch the Google ADK multi-agent simulation in real time: five defender
        personas (Gemini), a Gemini-Pro threat actor, and the A2A Containment
        Judge — with per-round scores and a live cost meter.
      </p>

      <div className="mt-8 rounded-xl border border-border/30 bg-card p-5">
        <button
          onClick={startNew}
          className="w-full rounded-lg bg-foreground px-4 py-2.5 text-sm font-medium text-background transition-opacity hover:opacity-90"
        >
          Start a new war-room session
        </button>

        <div className="mt-5">
          <label className="text-xs uppercase tracking-wide text-muted-foreground/70">
            Open an existing simulation id
          </label>
          <div className="mt-2 flex gap-2">
            <input
              value={simId}
              onChange={(e) => setSimId(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && open()}
              placeholder="e.g. demo-1718000000000"
              className="flex-1 rounded-lg border border-border/40 bg-background px-3 py-2 text-sm outline-none focus:border-border"
            />
            <button
              onClick={open}
              disabled={!simId.trim()}
              className="rounded-lg border border-border/40 px-4 py-2 text-sm transition-colors hover:bg-muted disabled:opacity-40"
            >
              Open
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
