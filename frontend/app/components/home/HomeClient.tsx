"use client";

import { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Link2, ArrowLeft, X } from "lucide-react";
import type { PipelineRun } from "@/app/types";
import AsciiSpinner from "@/app/components/ascii/AsciiSpinner";
import LogoAlive from "@/app/components/ascii/LogoAlive";
import { Card } from "@/app/components/ui/card";
import RunHistoryContent from "./RunHistoryContent";
import {
  AsciiTabBar,
  AsciiBadge,
  AsciiDivider,
  AsciiAlert,
  AsciiEmptyState,
} from "@/app/components/ascii/DesignSystem";

const EXAMPLES = [
  "Ransomware hitting finance systems",
  "Cloud credentials leaked on GitHub",
  "Supply chain compromise via vendor",
];

const MODE_TABS = [
  { key: "test", label: "Test ~25m", tooltip: "3 iterations, capped scenarios. Quick validation before scaling up." },
  { key: "quick", label: "Quick ~40m", tooltip: "10 iterations, 2 branches. Good baseline for demos." },
  { key: "standard", label: "Standard ~75m", tooltip: "50 iterations, full scenarios. Client-ready assessment." },
  { key: "deep", label: "Deep ~120m", tooltip: "100+ iterations, exhaustive analysis. Maximum statistical confidence." },
] as const;

export default function HomeClient() {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [context, setContext] = useState("");
  const [mode, setMode] = useState<"test" | "quick" | "standard" | "deep">("test");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [runs, setRuns] = useState<PipelineRun[]>([]);

  useEffect(() => {
    fetch("/api/runs")
      .then((res) => res.json())
      .then((json) => { if (json.data) setRuns(json.data); })
      .catch(() => {});
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!url.trim()) return;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/pipeline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyUrl: url.trim(),
          userContext: context.trim() || undefined,
          mode,
        }),
      });
      const json = await res.json();
      if (json.error) {
        setError(json.error);
        setLoading(false);
        return;
      }
      router.push(`/pipeline/${json.data.runId}`);
    } catch {
      setError("Failed to start pipeline");
      setLoading(false);
    }
  }, [url, context, mode, router]);

  const handleDeleteRun = useCallback((runId: string) => {
    setRuns((prev) => prev.filter((r) => r.runId !== runId));
  }, []);

  return (
    <div className="relative h-svh w-full overflow-hidden">
      {/* LogoAlive — fills entire viewport */}
      <LogoAlive />

      {/* Composer — ALWAYS visible, centered */}
      <div className="absolute inset-0 z-10 flex items-center justify-center px-6 pointer-events-none">
        <div className="w-full max-w-xl space-y-6">
          <div className="text-center space-y-2">
            <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-foreground">
              Predict what breaks next.
            </h1>
            <p className="text-base md:text-lg text-muted-foreground font-mono">
              Predictive incident response simulation.
            </p>
          </div>

          <AsciiDivider variant="dots" />

          <Card className="bg-card/70 backdrop-blur-sm pointer-events-auto">
            <div className="flex items-center gap-3 px-4 py-3">
              <Link2 className="size-4 shrink-0 text-muted-foreground/50" />
              <input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey && url.trim()) {
                    e.preventDefault();
                    handleSubmit();
                  }
                }}
                placeholder="company.com"
                aria-label="Company URL"
                autoComplete="url"
                disabled={loading}
                className="flex-1 bg-transparent border-none focus:ring-0 focus:outline-none text-sm font-mono text-foreground placeholder:text-muted-foreground/40 disabled:opacity-50 disabled:cursor-not-allowed"
              />
            </div>

            <div className="px-4 pb-3">
              <textarea
                value={context}
                onChange={(e) => setContext(e.target.value)}
                placeholder="Scenario, recent concerns, or systems to stress-test..."
                aria-label="Additional context"
                rows={2}
                disabled={loading}
                className="w-full bg-transparent border-none focus:ring-0 focus:outline-none text-xs font-mono text-foreground placeholder:text-muted-foreground/40 resize-none leading-relaxed disabled:opacity-50 disabled:cursor-not-allowed"
              />
            </div>

            <div className="flex items-center justify-between px-3 py-2 border-t border-border/20">
              <AsciiTabBar
                tabs={MODE_TABS.map((m) => ({ key: m.key, label: m.label, tooltip: m.tooltip }))}
                activeTab={mode}
                onTabChange={(key) => setMode(key as typeof mode)}
              />
              <button
                onClick={handleSubmit}
                disabled={!url.trim() || loading}
                className="bg-primary text-primary-foreground px-4 py-1.5 rounded-lg font-mono text-xs font-medium hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed min-w-[110px]"
              >
                {loading ? <><AsciiSpinner /> Analyzing</> : "Analyze"}
              </button>
            </div>
          </Card>

          {error && <div className="pointer-events-auto"><AsciiAlert variant="error">{error}</AsciiAlert></div>}

          <div className="flex flex-wrap justify-center gap-x-3 gap-y-1.5 pointer-events-auto">
            {EXAMPLES.map((ex) => (
              <button
                key={ex}
                onClick={() => setContext(ex)}
                className="hover:opacity-80 transition-opacity"
              >
                <AsciiBadge variant="muted" bracket="angle">{ex}</AsciiBadge>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* History drawer — slides up from bottom bar */}
      <div
        className="absolute left-0 right-0 z-20 transition-transform duration-300 ease-out"
        style={{
          bottom: "2.5rem", /* sits above the bottom bar */
          transform: historyOpen ? "translateY(0)" : "translateY(100%)",
        }}
      >
        <div className="bg-card/90 backdrop-blur-md border-t border-border/30 max-h-[50vh] flex flex-col pointer-events-auto shadow-lg">
          {/* Terminal header — light */}
          <div className="flex items-center justify-between px-4 py-2 border-b border-border/20 shrink-0">
            <span className="font-mono text-xs text-muted-foreground">
              <span className="text-primary/50 mr-1" aria-hidden="true">§</span>
              run-history :: {runs.length} {runs.length === 1 ? "run" : "runs"}
            </span>
            <button
              onClick={() => setHistoryOpen(false)}
              className="font-mono text-xs text-muted-foreground/50 hover:text-foreground transition-colors"
              aria-label="Close history"
            >
              <X className="size-3.5" />
            </button>
          </div>

          {/* Scrollable run list */}
          <div className="overflow-y-auto flex-1 pb-2">
            {runs.length === 0 ? (
              <div className="py-8">
                <AsciiEmptyState
                  title="No runs yet"
                  description="Start an analysis to see history here."
                  sigil="○"
                />
              </div>
            ) : (
              <RunHistoryContent
                runs={runs}
                onDelete={handleDeleteRun}
                heading="Previous analyses"
              />
            )}
          </div>
        </div>
      </div>

      {/* Bottom bar — always on top */}
      <div className="absolute bottom-0 left-0 right-0 z-30 pointer-events-auto flex items-center px-5 py-2.5 border-t border-border/15 bg-background/60 backdrop-blur-sm">
        <a href="/" className="flex items-center gap-2 transition-opacity hover:opacity-80 shrink-0">
          <span className="font-mono text-sm font-bold text-primary tracking-tighter">
            DirePhish
          </span>
          <span className="text-[7px] font-mono uppercase tracking-wider text-primary/50 border border-primary/30 rounded px-1 py-px leading-none">
            Alpha
          </span>
          <span className="font-mono text-[8px] tracking-widest text-primary/35 hidden sm:inline">
            by raxIT Labs
          </span>
        </a>

        <span
          className="flex-1 mx-4 font-mono text-[10px] text-muted-foreground/20 select-none overflow-hidden whitespace-nowrap text-center"
          aria-hidden="true"
        >
          {"─ · ".repeat(30)}
        </span>

        <button
          onClick={() => setHistoryOpen(!historyOpen)}
          className="flex items-center gap-1.5 font-mono text-xs text-muted-foreground/50 hover:text-foreground transition-colors shrink-0"
        >
          {historyOpen ? (
            <>
              <X className="size-3" />
              Close
            </>
          ) : (
            <>
              <span className="text-primary/50" aria-hidden="true">§</span>
              History{runs.length > 0 ? ` [${runs.length}]` : ""}
            </>
          )}
        </button>
      </div>
    </div>
  );
}
